# Supabase: skupna skupnost Ahoier

Ta nastavitev poveže **skupno skupnost** s Supabase Auth in Postgres. Lokalni predogled (`ahoier:community:v1`), Ahoi Dates in pilotna SQLite baza ostanejo ločeni. Podatkov iz njih ne uvažaj samodejno. Prijavljen uporabnik s prikaznim imenom si lahko brez kode izbere katerokoli plovbo, ki jo je ustvaril upravljavec. Članstvo **ne pomeni** preverjene rezervacije, identitete ali dejanske prisotnosti na ladji.

## 1. Ustvari projekt in nastavi prijavo

V [Supabase Dashboardu](https://supabase.com/dashboard/projects) ustvari nov projekt. V **Authentication → Providers → Email** omogoči prijavo s povezavo po e-pošti (Magic Link). V **Authentication → URL Configuration** dodaj `http://127.0.0.1:3010/community` med `Redirect URLs`; če stran odpiraš prek `localhost`, dodaj tudi `http://localhost:3010/community`. Za projekt, namenjen samo lokalnemu Ahoierju, lahko `Site URL` nastaviš na `http://127.0.0.1:3010/community`; pri deljenem projektu ga ne spreminjaj brez pregleda drugih aplikacij. Ahoierjeva odjemalska prijava uporabi dejanski naslov odprte strani za `emailRedirectTo` in tam obdela implicitni Auth povratni tok; poti `/auth/callback` ta različica ne uporablja. Ob produkcijski objavi dodaj točen HTTPS naslov produkcijske skupnosti med dovoljene preusmeritve.

V **Project Settings → API / Connect** kopiraj `Project URL` in **publishable** key v lokalni `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

`.env.local` je izključen iz Gita. V Ahoier ne dodajaj `secret`, `service_role` ali database gesla; aplikacija uporablja uporabnikov Auth žeton in pravila RLS. Publishable key ni skrivnost, vendar sam po sebi ne daje dostopa do vrstic. Po spremembi `NEXT_PUBLIC_*` ponovno zaženi razvojni strežnik; Next te vrednosti v produkciji vgradi med gradnjo, zato tam ponovno zgradi in objavi aplikacijo. Prijavni tok preveri na `http://127.0.0.1:3010/community` po `npm run dev`.

## 2. Ustvari shemo

V **SQL Editorju** z lastniško vlogo projekta zaženi migraciji **v tem vrstnem redu**, vsako samo enkrat: najprej zgodovinsko osnovno shemo [`20261001000000_ahoier_shared_community.sql`](../supabase/migrations/20261001000000_ahoier_shared_community.sql), nato spremembo za odprte plovbe [`20261002000000_ahoier_open_voyages.sql`](../supabase/migrations/20261002000000_ahoier_open_voyages.sql). Lahko ju uporabiš tudi kot zaporedni migraciji Supabase CLI. Če je prva migracija že nameščena, izvedi samo drugo. V projektu naj bo prek Data API izpostavljena samo predvidena javna shema; **`ahoier_private` nikoli ne dodaj med Exposed schemas**. Prva migracija je zgodovinski zapis zasnove s kodami; druga odstrani uporabo kode za vstop v sedanjo skupnost. Pred objavo odjemalca brez kode mora biti druga migracija že izvedena, sicer pridružitev ne bo delovala.

Tabele: `ahoier_profiles` (prikazno ime), `ahoier_voyages` (plovbe), `ahoier_memberships` (članstva), `ahoier_posts` (objave), `ahoier_replies` (odgovori), `ahoier_reports` (prijave vsebine). Prijavljen uporabnik lahko vidi seznam ustvarjenih plovb in po shranitvi profila doda svoje članstvo. Ne more ustvarjati plovb ali članstva za drugo osebo. Profilno ime vidi lastnik; drugi člani skupne plovbe ga vidijo šele, ko ima ta uporabnik tam vidno objavo ali odgovor. Imenika vseh članov ni. Objave in odgovori so vidni le članom iste plovbe; skrita vsebina ni vidna. Avtor lahko doda ali izbriše svojo vsebino. Gosti lahko prijavo **samo vložijo**: ne morejo brati seznama prijav, ga spreminjati ali sami nastaviti `hidden_at`. Prijavijo lahko objavo ali odgovor drugega avtorja, ne svoje vsebine. Trigger ob vložitvi prijave shrani takratno vsebino, avtorjev ID in ID plovbe v stolpce, ki jih gostje ne morejo brati ali pisati.

## 3. Ustvari plovbe

Plovbo ustvari upravljavec v **SQL Editorju**. Izberi ladjo in datume, ki jih bodo gostje lahko prepoznali. Vnos v katalog sam po sebi ne pomeni, da je gost rezerviral to pot ali je na ladji. Gostje lahko izberejo samo vnaprej ustvarjene plovbe; prek odjemalca ne morejo ustvariti novega zapisa.

```sql
insert into public.ahoier_voyages (ship, starts_on, ends_on)
values ('AIDAcosma', '2026-11-01', '2026-11-08')
returning id, ship, starts_on, ends_on;
```

Prijavljen gost najprej shrani prikazno ime v `ahoier_profiles`, nato v aplikaciji izbere eno od ustvarjenih plovb. Odjemalec vstavi `(voyage_id, user_id)` v `ahoier_memberships`; pravila RLS dovolijo samo lastno članstvo za obstoječo plovbo. Objave so vezane na UUID izbrane plovbe, ne na poljubno kombinacijo ladje in datumov. Če ni nobene ustvarjene plovbe, se gost ne more pridružiti skupnosti, dokler je upravljavec ne doda.

Upravljavec lahko plovbe in število članov preveri v SQL Editorju:

```sql
select v.id, v.ship, v.starts_on, v.ends_on, count(m.user_id) as members
from public.ahoier_voyages v
left join public.ahoier_memberships m on m.voyage_id = v.id
group by v.id, v.ship, v.starts_on, v.ends_on
order by v.starts_on desc, v.ship;
```

Ker se lahko vsak prijavljen uporabnik pridruži katerikoli plovbi, odstranitev same vrstice iz `ahoier_memberships` ni trajna blokada: uporabnik se lahko znova pridruži. Za takšno omejitev je potreben ločen postopek blokiranja oziroma upravljanje Auth računa. Za sedanjo skupnost ne ustvarjaj ali razdeljuj kod; kode v ločenem pilotu `/pilot` so namenjene samo pilotnemu dostopu.

## 4. Ročna moderacija

Gostu je uspešna prijava shranjena v `ahoier_reports`; **pregledovanje in odziv potekata ročno v SQL Editorju** z upravljavsko vlogo. Naslednja poizvedba pokaže prijave, izvirni posnetek prijavljenega besedila in še obstoječo vsebino. Če je avtor vsebino izbrisal, `current_body` postane `NULL`, posnetek pa ostane za pregled.

```sql
select r.id, r.created_at, r.reason, r.details, r.reporter_id,
       r.post_id, r.reply_id, r.target_voyage_id, r.target_author_id,
       r.target_body,
       case when r.post_id is not null then p.body else reply.body end as current_body
from public.ahoier_reports r
left join public.ahoier_posts p on p.id = r.post_id
left join public.ahoier_replies reply on reply.id = r.reply_id
order by r.created_at desc
limit 100;
```

Po presoji upravljavec skrije objavo ali odgovor. Skrita objava skrije tudi njene odgovore, ker RLS zahteva vidno nadrejeno objavo.

```sql
update public.ahoier_posts set hidden_at = now()
where id = 'POST_UUID' and hidden_at is null returning id;

update public.ahoier_replies set hidden_at = now()
where id = 'REPLY_UUID' and hidden_at is null returning id;
```

Ročni SQL pregled ni nadomestilo za ekipo, odzivne roke, pravila obravnave zlorab in obvestila uporabnikom. Brez tega skupnost ni pripravljena za javni zagon.

`target_body` lahko vsebuje osebne podatke, ki jih je nekdo zapisal v prijavljeno vsebino. Dostop do SQL Editorja omeji na upravljavce, določi rok hrambe ter po zaključku obravnave ročno izbriši nepotrebne prijave (vključno s posnetkom):

```sql
delete from public.ahoier_reports where id = 'RESOLVED_REPORT_UUID' returning id;
```

Samodejnega roka brisanja ta začetna različica nima; spremljaj tudi varnostne kopije glede na svojo politiko hrambe.

## 5. Preveri pravice dostopa

Te poizvedbe za preverjanje so namenjene **ločenemu testnemu Supabase projektu** po obeh migracijah. Ustvari tri testne Auth uporabnike A, B in C s profili; A in B naj se pridružita isti plovbi, C pa drugi. Naj A in B ustvarita vsaj eno objavo, B pa odgovor. Njihove UUID-je vstavi v spodnje primere. Za vsak primer uporabi novo transakcijo v SQL Editorju in na koncu `rollback`, da preizkusne spremembe ne ostanejo. Preizkusi tudi dejanski odjemalski tok: po e-poštni prijavi se prikaže katalog plovb, pridružitev ne zahteva kode, preklop med že pridruženimi plovbami pa pokaže samo vsebino izbrane plovbe.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"UUID_USER_A"}';
select auth.uid();
select id, ship, starts_on, ends_on from public.ahoier_voyages; -- katalog plovb
select id, voyage_id, body from public.ahoier_posts; -- samo objave iz A-jeve plovbe
select user_id, display_name from public.ahoier_profiles; -- A in B, ker sta objavila; ne C
select * from public.ahoier_memberships; -- samo A-jeve članstvene vrstice
select * from public.ahoier_reports; -- pričakovana napaka permission denied
rollback;
```

Enako ponovi za B (vidi A-jevo in svojo vsebino) ter C (pred pridružitvijo plovbi A/B ne vidi njune vsebine). Kot `anon` naj branje `ahoier_voyages`, `ahoier_posts` in `ahoier_profiles` vrne `permission denied`; prav tako anon ne sme dodati članstva. Uporabi `set local role anon;` v ločeni transakciji. Preizkusi še mutacije z vnaprej pripravljenimi UUID-ji. Prijavljen uporabnik lahko vidi katalog, ne more pa ustvarjati plovb ali članstva za drugega uporabnika:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"UUID_USER_A"}';
insert into public.ahoier_memberships (voyage_id, user_id)
values ('UUID_VOYAGE_NOT_YET_JOINED', 'UUID_USER_A'); -- dovoljena lastna pridružitev
rollback;
```

Ponovi v novi transakciji z B-jevim `user_id`: RLS mora vnos zavrniti. Poskusi tudi neposreden `insert` v `ahoier_voyages`: za `authenticated` mora biti zavrnjen. UUID plovbe mora obstajati; ponovni vnos istega članstva naj zadene omejitev enoličnosti, aplikacija pa ga ne ponuja več med razpoložljivimi plovbami.

Primer dovoljenega vnosa objave; kopijo iste transakcije uporabi za zavrnitveni primer, tako da `author_id` zamenjaš z B-jevim UUID oziroma `voyage_id` z ID-jem C-jeve plovbe, **preden** se A pridruži C-jevi plovbi. Zavrnitev je pričakovana napaka RLS, uspešni poskusi pa se ob `rollback` odstranijo.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"UUID_USER_A"}';
insert into public.ahoier_posts (voyage_id, author_id, category, body)
values ('UUID_VOYAGE_A_B', 'UUID_USER_A', 'Frage', 'RLS testna objava')
returning id;
rollback;
```

Za odgovor zamenjaj spodnji `post_id` z ID-jem A-jeve objave. B-jev odgovor mora uspeti; C-jev na isti post mora pasti, dokler C ni član A/B plovbe. Za prijavo naj A uporabi ID B-jeve objave ali odgovora. Prijava lastne vsebine ter prijava vsebine druge plovbe pred pridružitvijo morata pasti. V vsakem negativnem primeru začni novo transakcijo.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"UUID_USER_B"}';
insert into public.ahoier_replies (post_id, author_id, body)
values ('UUID_POST_BY_A', 'UUID_USER_B', 'RLS testni odgovor');
rollback;
```

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"UUID_USER_A"}';
insert into public.ahoier_reports (post_id, reporter_id, reason, details)
values ('UUID_POST_BY_B', 'UUID_USER_A', 'spam', 'Test');
rollback;
```

| Dejanje pod vlogo `authenticated` | Pričakovano |
| --- | --- |
| A bere katalog plovb in doda svoje članstvo v obstoječo plovbo | uspeh brez kode |
| A doda članstvo za B ali neposredno ustvari plovbo | zavrnitev |
| A vstavi objavo s svojim `author_id` v svojo plovbo | uspeh |
| A vstavi objavo z B-jevim `author_id` ali v plovbo, katere član še ni | RLS zavrne |
| B doda odgovor na A-jevo objavo | uspeh |
| C doda odgovor na A-jevo objavo pred pridružitvijo A/B plovbi | RLS zavrne |
| A izbriše B-jevo objavo; A izbriše svojo objavo | prvo ne izbriše nič, drugo uspe |
| A prijavi B-jevo objavo ali odgovor | uspeh, vendar prijave ne more brati |
| A prijavi svojo objavo/odgovor ali tuj post iz plovbe, katere član še ni | RLS zavrne |
| B poskusi `update public.ahoier_posts set hidden_at = now()` | permission denied |
| Neprijavljen obiskovalec bere objave ali doda članstvo | zavrnitev |

Pri SQL Editorju pazljivo nastavi **oba**: vlogo in JWT `sub`. Brez `set local role authenticated` se ukaz lahko izvede kot lastnik in obide RLS. Pred produkcijo ponovi scenarije z dejanskimi odjemalskimi sejami; ročni SQL pregled še ni avtomatiziran preizkus.

Uradna referenca: [Supabase RLS in dovoljenja](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [upravljanje ključev](https://supabase.com/docs/guides/getting-started/api-keys).
