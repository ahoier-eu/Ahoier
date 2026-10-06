/** The caller supplies only content visible to this guest and voyage. */
export type CompassMeetup = {
  id: string;
  starts_at: string;
  capacity: number;
  attendee_count: number;
  joined_by_me: boolean;
  canceled_at: string | null;
};

export type CompassQuestion = {
  id: string;
  category: string;
  created_at: string;
};

export type LiveSocialCompassChoice<
  Meetup extends CompassMeetup = CompassMeetup,
  Question extends CompassQuestion = CompassQuestion,
> =
  | { kind: "meetup"; meetup: Meetup; participation: "joined" | "available"; spacesLeft: number }
  | { kind: "question"; post: Question }
  | { kind: "empty" };

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function earlier<Meetup extends CompassMeetup>(
  candidate: Meetup,
  selected: Meetup | undefined,
): boolean {
  if (!selected) return true;
  const candidateTime = Date.parse(candidate.starts_at);
  const selectedTime = Date.parse(selected.starts_at);
  return candidateTime < selectedTime || candidateTime === selectedTime && candidate.id < selected.id;
}

function later<Question extends CompassQuestion>(
  candidate: Question,
  selected: Question | undefined,
): boolean {
  if (!selected) return true;
  const candidateTime = Date.parse(candidate.created_at);
  const selectedTime = Date.parse(selected.created_at);
  return candidateTime > selectedTime || candidateTime === selectedTime && candidate.id > selected.id;
}

export function selectLiveSocialCompass<
  Meetup extends CompassMeetup,
  Question extends CompassQuestion,
>({ meetups, posts, now = Date.now() }: {
  meetups: readonly Meetup[];
  posts: readonly Question[];
  now?: number | Date;
}): LiveSocialCompassChoice<Meetup, Question> {
  const currentTime = now instanceof Date ? now.getTime() : now;
  let nextJoined: Meetup | undefined;
  let nextAvailable: Meetup | undefined;

  if (Number.isFinite(currentTime)) {
    for (const meetup of meetups) {
      const startsAt = Date.parse(meetup.starts_at);
      if (meetup.canceled_at || !Number.isFinite(startsAt) || startsAt <= currentTime) continue;

      if (meetup.joined_by_me) {
        if (startsAt - currentTime <= FORTY_EIGHT_HOURS_MS && earlier(meetup, nextJoined)) {
          nextJoined = meetup;
        }
      } else if (Number.isFinite(meetup.capacity) && Number.isFinite(meetup.attendee_count)
        && meetup.capacity > meetup.attendee_count && earlier(meetup, nextAvailable)) {
        nextAvailable = meetup;
      }
    }
  }

  const selected = nextJoined ?? nextAvailable;
  if (selected) {
    const spacesLeft = Number.isFinite(selected.capacity) && Number.isFinite(selected.attendee_count)
      ? Math.max(0, selected.capacity - selected.attendee_count) : 0;
    return { kind: "meetup", meetup: selected, participation: nextJoined ? "joined" : "available", spacesLeft };
  }

  let latestQuestion: Question | undefined;
  for (const post of posts) {
    if (post.category === "Frage" && Number.isFinite(Date.parse(post.created_at))
      && later(post, latestQuestion)) latestQuestion = post;
  }
  return latestQuestion ? { kind: "question", post: latestQuestion } : { kind: "empty" };
}
