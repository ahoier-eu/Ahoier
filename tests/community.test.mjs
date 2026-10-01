import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendeeCount, availablePlaces, decodeState, freshState, examples, isUpcomingMeeting, joinMeeting, leaveMeeting, memberPartySize, updateMeetingPartySize, validateMeeting, scopeKey } from '../src/lib/community.ts';

test('joining respects capacity, uniqueness and cancellation', () => {
  const event = {...examples('2026-10-01').meetings[0],capacity:3};
  const joined=joinMeeting(event,'local-guest');
  assert.equal(attendeeCount(joined),3);
  assert.equal(memberPartySize(joined,'local-guest'),1);
  assert.equal(availablePlaces(joined),0);
  assert.equal(joinMeeting(joined,'local-guest'),joined);
  assert.equal(joinMeeting(joined,'another'),joined);
  const cancelled={...event,cancelled:true};
  assert.equal(joinMeeting(cancelled,'local-guest'),cancelled);
  assert.equal(event.members.length,2);
});
test('group RSVP counts people, preserves member IDs, and refuses an overbooking', () => {
  const event=examples('2026-10-01').meetings.find(m => m.id === 'demo-family');
  assert.ok(event);
  assert.equal(attendeeCount(event),1);
  const family=joinMeeting(event,'local-guest',4);
  assert.deepEqual(family.members,['demo-sara','local-guest']);
  assert.equal(memberPartySize(family,'local-guest'),4);
  assert.equal(attendeeCount(family),5);
  assert.equal(availablePlaces(family),5);
  assert.equal(joinMeeting(family,'another-family',6),family);
  const full=joinMeeting(family,'another-family',5);
  assert.equal(attendeeCount(full),10);
  assert.equal(availablePlaces(full),0);
  assert.equal(joinMeeting(full,'one-more'),full);
  assert.equal(attendeeCount(event),1);
});
test('party size updates release places but never exceed capacity', () => {
  const event={...examples('2026-10-01').meetings[0],capacity:5};
  const couple=joinMeeting(event,'local-guest',2);
  assert.equal(attendeeCount(couple),4);
  assert.equal(updateMeetingPartySize(couple,'local-guest',4),couple);
  const three=updateMeetingPartySize(couple,'local-guest',3);
  assert.equal(attendeeCount(three),5);
  assert.equal(updateMeetingPartySize(three,'local-guest',3),three);
  const solo=updateMeetingPartySize(three,'local-guest',1);
  assert.equal(availablePlaces(solo),2);
  assert.equal(updateMeetingPartySize(solo,'unknown',2),solo);
  assert.equal(updateMeetingPartySize({...solo,cancelled:true},'local-guest',2).memberCounts['local-guest'],1);
});
test('invalid group sizes do not change meetings', () => {
  const event=examples('2026-10-01').meetings[0];
  const joined=joinMeeting(event,'local-guest',2);
  for (const count of [0,-1,1.5,11,NaN,Infinity]) {
    assert.equal(joinMeeting(event,'local-guest',count),event);
    assert.equal(updateMeetingPartySize(joined,'local-guest',count),joined);
  }
});
test('host keeps their place and leaving a group frees all its places', () => {
  const event=examples('2026-10-01').meetings[0];
  assert.equal(leaveMeeting(event,event.author),event);
  const joined=joinMeeting(event,'local-guest',3);
  const left=leaveMeeting(joined,'local-guest');
  assert.equal(left.members.includes('local-guest'),false);
  assert.equal(Object.hasOwn(left.memberCounts,'local-guest'),false);
  assert.equal(attendeeCount(left),2);
  assert.equal(availablePlaces(left),4);
  assert.equal(leaveMeeting(left,'local-guest'),left);
  const hostGroup=updateMeetingPartySize(event,event.author,2);
  assert.equal(memberPartySize(hostGroup,event.author),2);
  assert.equal(leaveMeeting(hostGroup,event.author),hostGroup);
});
test('meeting validation checks travel dates, real dates, time and capacity', () => {
  const event=examples('2026-10-01').meetings[0];
  const now=new Date('2026-09-30T22:30:00Z');
  assert.equal(validateMeeting(event,'2026-10-01','2026-10-08',now),null);
  for(const invalid of [{date:'2026-10-09'},{date:'2026-02-30'},{time:'25:00'},{capacity:1},{capacity:3.5},{title:'  '},{place:'  '}]) {
    assert.ok(validateMeeting({...event,...invalid},'2026-10-01','2026-10-08',now));
  }
  assert.match(validateMeeting({...event,time:'00:15'},'2026-10-01','2026-10-08',now),/zukünftigen Termin/);
  assert.match(validateMeeting({...event,time:'00:30'},'2026-10-01','2026-10-08',now),/zukünftigen Termin/);
  assert.equal(validateMeeting({...event,time:'00:31'},'2026-10-01','2026-10-08',now),null);
});

test('only future non-cancelled meetings are upcoming in prototype ship time', () => {
  const now=new Date('2026-10-01T15:30:00Z'); // 17:30 in Europe/Berlin
  const base={date:'2026-10-01',time:'18:30',cancelled:false};
  assert.equal(isUpcomingMeeting(base,now),true);
  assert.equal(isUpcomingMeeting({...base,time:'17:30'},now),false);
  assert.equal(isUpcomingMeeting({...base,date:'2026-09-30'},now),false);
  assert.equal(isUpcomingMeeting({...base,cancelled:true},now),false);
});

test('journey examples schedule only future meetings within its dates', () => {
  const now=new Date('2026-10-01T15:30:00Z'); // 17:30 in Europe/Berlin
  const space=examples('2026-10-01','2026-10-03',now);
  assert.equal(space.meetings.length,4);
  assert.ok(space.meetings.every(m => m.date >= '2026-10-01' && m.date <= '2026-10-03' && isUpcomingMeeting(m,now)));
  assert.equal(space.meetings.find(m => m.id === 'demo-dinner')?.date,'2026-10-01');
  assert.equal(space.meetings.find(m => m.id === 'demo-games')?.date,'2026-10-02');
  assert.deepEqual(examples('2026-10-01','2026-10-01',now).meetings.map(m => m.id),['demo-dinner']);
  assert.equal(examples('2026-09-01','2026-09-07',now).meetings.length,0);
  assert.ok(examples('2026-10-03','2026-10-05',now).meetings.every(m => m.date === '2026-10-03'));
});
test('storage recovery rejects corrupt shapes and preserves separate travel spaces', () => {
  assert.deepEqual(decodeState('{broken'),freshState());
  assert.deepEqual(decodeState('{"version":1,"profile":null}'),freshState());
  const a=scopeKey('AIDAcosma','2026-10-01','2026-10-08');
  const b=scopeKey('AIDAnova','2026-10-01','2026-10-08');
  const state=freshState();state.spaces[a]=examples('2026-10-01');state.spaces[b]=examples('2026-10-02');
  state.spaces[a].meetings.push({id:'malformed'});
  const restored=decodeState(JSON.stringify(state));
  assert.equal(restored.spaces[a].meetings.length,4);
  assert.equal(restored.spaces[b].meetings[0].date,'2026-10-02');
  assert.equal(restored.spaces[a].meetings[0].date,'2026-10-01');
});
test('old v1 storage gains private travel group, family flags, and one place per member', () => {
  const key=scopeKey('AIDAcosma','2026-10-01','2026-10-08');
  const state=freshState();
  state.spaces[key]=examples('2026-10-01');
  delete state.profile.travelGroup;
  for (const meeting of state.spaces[key].meetings) {
    delete meeting.familyFriendly;
    delete meeting.memberCounts;
  }
  const restored=decodeState(JSON.stringify(state));
  assert.equal(restored.profile.travelGroup,'');
  assert.equal(restored.spaces[key].meetings.length,4);
  assert.equal(restored.spaces[key].meetings[0].familyFriendly,false);
  assert.deepEqual(restored.spaces[key].meetings[0].memberCounts,{'demo-lena':1,'demo-ben':1});
  assert.equal(attendeeCount(restored.spaces[key].meetings[0]),2);
  assert.equal(restored.spaces[key].meetings[3].familyFriendly,false);
});
test('family-friendly demo remains clearly illustrative and can accept a group', () => {
  const family=examples('2026-10-01').meetings.find(m => m.familyFriendly);
  assert.ok(family);
  assert.equal(family.demo,true);
  assert.match(family.description,/Beispiel:/);
  assert.ok(availablePlaces(family)>=4);
});
test('storage rejects inconsistent party counts without dropping other meetings', () => {
  const key=scopeKey('AIDAcosma','2026-10-01','2026-10-08');
  const state=freshState();
  state.profile.travelGroup='family';
  const valid=examples('2026-10-01').meetings[0];
  state.spaces[key]={...examples('2026-10-01'),meetings:[
    valid,
    {...valid,id:'missing-count',memberCounts:{'demo-lena':1}},
    {...valid,id:'extra-count',memberCounts:{'demo-lena':1,'demo-ben':1,'other':1}},
    {...valid,id:'overbooked',capacity:2,memberCounts:{'demo-lena':2,'demo-ben':2}},
    {...valid,id:'fractional',memberCounts:{'demo-lena':1.5,'demo-ben':1}},
    {...valid,id:'invalid-flag',familyFriendly:'yes'},
  ]};
  const restored=decodeState(JSON.stringify(state));
  assert.equal(restored.profile.travelGroup,'family');
  assert.deepEqual(restored.spaces[key].meetings.map(m=>m.id),[valid.id]);
});
