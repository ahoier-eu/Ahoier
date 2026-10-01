# Supabase: skupna skupnost Ahoier

Ta nastavitev poveže **novo skupno skupnost** s Supabase Auth in Postgres. Lokalni predogled (`ahoier:community:v1`), Ahoi Dates in pilotna SQLite baza ostanejo ločeni. Podatkov iz njih ne uvažaj samodejno. Članstvo pomeni posedovanje kode za določeno plovbo, **ne** preverjene rezervacije, identitete ali dejanske prisotnosti na ladji.

## 1. Ustvari projekt in nastavi prijavo

V [Supabase Dashboardu](https://supabase.com/dashboard/projects) ustvari nov projekt. V **Authentication → Providers → Email** omogoči prijavo s povezavo po e-pošti (Magic Link). V **Authentication → URL Configuration** nastavi `Site URL` na `http://localhost:3010/community` za lokalni razvoj in dodaj **točno** `http://localhost:3010/community` med `Redirect URLs`. Ahoierjeva trenutna odjemalska prijava uporablja `emailRedirectTo` na `/community` in tam obdela implicitni Auth povratni tok; poti `/auth/callback` ta različica ne uporablja. Ob produkcijski objavi uporabi točen HTTPS naslov produkcijske skupnosti v obeh nastavitvah.

V **Project Settings → API / Connect** kopiraj `Project URL` in **publishable** key v lokalni `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

`.env.local` je izključen iz Gita. V Ahoier ne dodajaj `secret`, `service_role` ali database gesla; aplikacija uporablja uporabnikov Auth žeton in pravila RLS. Publishable key ni skrivnost, vendar sam po sebi ne daje dostopa do vrstic. Po spremembi `NEXT_PUBLIC_*` ponovno zaženi razvojni strežnik; Next te vrednosti v produkciji vgradi med gradnjo, zato tam ponovno zgradi in objavi aplikacijo. Prijavni tok preveri na `http://localhost:3010/community` po `npm run dev`.

## 2. Ustvari shemo

V **SQL Editorju** z lastniško vlogo projekta zaženi celotno datoteko [`supabase/migrations/20261001000000_ahoier_shared_community.sql`](../supabase/migrations/20261001000000_ahoier_shared_community.sql) enkrat, ali jo uporabi kot migracijo Supabase CLI. V projektu naj bo prek Data API izpostavljena samo predvidena javna shema; **`ahoier_private` nikoli ne dodaj med Exposed schemas**. `public.ahoier_join_voyage(p_code)` je odjemalcu dostopen RPC, ki kliče strogo omejeno funkcijo v tej zasebni shemi. Privilegirana funkcija uporablja prazno `search_path`, koda pa se zgoščuje s SHA-256. Samo vloga `authenticated` lahko prikliče javni RPC.

Tabele: `ahoier_profiles` (prikazno ime), `ahoier_voyages` (plovba), `ahoier_memberships`, `ahoier_posts`, `ahoier_replies`, `ahoier_reports`; `ahoier_private.ahoier_invites` hrani samo zgoščene kode. Profilno ime vidi lastnik; drugi člani skupne plovbe ga vidijo šele, ko ima ta uporabnik tam vidno objavo ali odgovor. Imenika vseh povabljenih ni. Objave in odgovori so vidni le članom iste plovbe; skrita vsebina ni vidna. Avtor lahko doda ali izbriše svojo vsebino. Gosti lahko prijavo **samo vložijo**: ne morejo brati seznama prijav, ga spreminjati ali sami nastaviti `hidden_at`. Prijavijo lahko objavo ali odgovor drugega avtorja, ne svoje vsebine. Trigger ob vložitvi prijave shrani takratno vsebino, avtorjev ID in ID plovbe v stolpce, ki jih gostje ne morejo brati ali pisati.

## 3. Ustvari plovbo in vabila

Plovbo ustvari upravljavec v **SQL Editorju**. Datumi naj predstavljajo dejansko skupino, ki ji razdeliš kode; zgolj izbor ladje in datumov v lokalnem predogledu ne potrjuje članstva.

```sql
insert into public.ahoier_voyages (ship, starts_on, ends_on)
values ('AIDAcosma', '2026-11-01', '2026-11-08')
returning id;
```

Na **svojem računalniku** za vsako vabilo zaženi `node scripts/generate-ahoier-invite.mjs`. Skript izdela naključno 32-mestno šestnajstiško kodo (128 bitov) in njen 64-mestni SHA-256 hash. Kodo posamezniku predaš zasebno; **v SQL vnesi samo hash**, nikoli kode. Primer (nadomesti UUID in hash):

```sql
insert into ahoier_private.ahoier_invites
  (code_hash, voyage_id, max_uses, expires_at)
values
  ('64_HEX_CHARACTERS_FROM_SCRIPT', 'VOYAGE_UUID_FROM_QUERY', 1, now() + interval '14 days');
```

Za osebno vabilo uporabi `max_uses = 1`. Ob uporabi se poveča števec in ustvari članstvo v eni transakciji; isto vabilo za že včlanjenega uporabnika ne porabi dodatne uporabe. Če namerno povabiš skupino z isto kodo, zvišaj `max_uses` in zavedaj se, da imetniki kode lahko povabijo še druge. Vabilo lahko prekličeš z `update ahoier_private.ahoier_invites set revoked_at = now() where code_hash = 'HASH';`; obstoječa članstva s tem **ne** izginejo. Če je treba izključiti člana, naj upravljavec posebej odstrani njegovo vrstico iz `ahoier_memberships` in preuči zlorabo. Ne dodajaj kod, hashov ali izvozov uporabnikov v Git.

Prijavljeni uporabnik mora najprej ustvariti `ahoier_profiles` vrstico s svojim `auth.uid()` in prikaznim imenom, nato odjemalec kliče `supabase.rpc('ahoier_join_voyage', { p_code: code })`; vrnjena vrednost je UUID plovbe. Objave so vezane na ta UUID, ne na poljubno kombinacijo ladje in datumov.

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

Te poizvedbe za preverjanje so namenjene **ločenemu testnemu Supabase projektu** po migraciji. Ustvari tri testne Auth uporabnike A, B in C; A in B naj se z različnima kodama pridružita isti plovbi, C drugi. Naj A in B ustvarita vsaj eno objavo, B pa odgovor. Njihove UUID-je vstavi v spodnje primere. Za vsak primer uporabi novo transakcijo v SQL Editorju in na koncu `rollback`, da preizkusne spremembe ne ostanejo. Lokalno jih še nismo izvedli, ker Supabase CLI/Postgres nista nameščena.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"UUID_USER_A"}';
select auth.uid();
select id, voyage_id, body from public.ahoier_posts; -- samo objave iz A-jeve plovbe
select user_id, display_name from public.ahoier_profiles; -- A in B, ker sta objavila; ne C
select * from public.ahoier_memberships; -- samo A-jeve članstvene vrstice
select * from public.ahoier_reports; -- pričakovana napaka permission denied
rollback;
```

Enako ponovi za B (vidi A-jevo in svojo vsebino) ter C (ne vidi vsebine A/B). Kot `anon` naj `select * from public.ahoier_posts` in `select * from public.ahoier_profiles` vrneta `permission denied`; enako `select public.ahoier_join_voyage('...')`. Uporabi `set local role anon;` v ločeni transakciji. Preizkusi še mutacije z vnaprej pripravljenimi UUID-ji:

Primer dovoljenega vnosa; kopijo iste transakcije uporabi za zavrnitveni primer, tako da `author_id` zamenjaš z B-jevim UUID oziroma `voyage_id` z ID-jem C-jeve plovbe. Zavrnitev je pričakovana napaka RLS, uspešni poskusi pa se ob `rollback` odstranijo.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"UUID_USER_A"}';
insert into public.ahoier_posts (voyage_id, author_id, category, body)
values ('UUID_VOYAGE_A_B', 'UUID_USER_A', 'Frage', 'RLS testna objava')
returning id;
rollback;
```

Za odgovor zamenjaj spodnji `post_id` z ID-jem A-jeve objave. B-jev odgovor mora uspeti; C-jev na isti post mora pasti. Za prijavo naj A uporabi ID B-jeve objave ali odgovora. Prijava lastne vsebine ter prijava vsebine druge plovbe morata pasti. V vsakem negativnem primeru začni novo transakcijo.

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
| A vstavi objavo s svojim `author_id` v svojo plovbo | uspeh |
| A vstavi objavo z B-jevim `author_id` ali v C-jevo plovbo | RLS zavrne |
| B doda odgovor na A-jevo objavo | uspeh |
| C doda odgovor na A-jevo objavo | RLS zavrne |
| A izbriše B-jevo objavo; A izbriše svojo objavo | prvo ne izbriše nič, drugo uspe |
| A prijavi B-jevo objavo ali odgovor | uspeh, vendar prijave ne more brati |
| A prijavi svojo objavo/odgovor ali tuj post iz C-jeve plovbe | RLS zavrne |
| B poskusi `update public.ahoier_posts set hidden_at = now()` | permission denied |
| Nečlan kliče `ahoier_join_voyage` z veljavno kodo | pridruži se samo plovbi te kode |
| Klic RPC z napačno, poteklo ali že porabljeno kodo | zavrnjen |

Pri SQL Editorju pazljivo nastavi **oba**: vlogo in JWT `sub`. Brez `set local role authenticated` se ukaz lahko izvede kot lastnik in obide RLS. Pred produkcijo ponovi scenarije z dejanskimi odjemalskimi sejami; ročni SQL pregled še ni avtomatiziran preizkus.

Uradna referenca: [Supabase RLS in dovoljenja](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [upravljanje ključev](https://supabase.com/docs/guides/getting-started/api-keys).
