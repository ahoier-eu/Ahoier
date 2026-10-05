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

V **SQL Editorju** z lastniško vlogo projekta zaženi migracije **v tem vrstnem redu**, vsako samo enkrat: osnovno shemo [`20261001000000_ahoier_shared_community.sql`](../supabase/migrations/20261001000000_ahoier_shared_community.sql), odprte plovbe [`20261002000000_ahoier_open_voyages.sql`](../supabase/migrations/20261002000000_ahoier_open_voyages.sql) in družabno steno [`20261003000000_ahoier_social_wall.sql`](../supabase/migrations/20261003000000_ahoier_social_wall.sql). Če sta prvi dve že nameščeni, izvedi samo tretjo. V projektu naj bo prek Data API izpostavljena samo predvidena javna shema; **`ahoier_private` nikoli ne dodaj med Exposed schemas**. Tretjo migracijo in zasebno shrambo izvedi pred objavo novega `/community` odjemalca.

Tretja migracija ohrani obstoječe objave in doda fotografije, odzive, Stories, prijateljstva, zasebna sporočila, blokiranje ter moderatorsko vrsto. Obstoječi uporabniki ob naslednjem obisku sami potrdijo polnoletnost; njihovi podatki ostanejo. Imenik pokaže prikazno ime in neobvezno fotografijo vseh članov izbrane plovbe. Ker se ji lahko pridruži vsak prijavljen odrasel uporabnik, to ni seznam potrjenih potnikov. E-poštni naslov se v imeniku ne prikazuje. Zasebni pogovor je mogoč šele po obojestranski potrditvi prijateljstva.

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

## 4. Ročna moderacija osnovne sheme

Spodnji SQL postopek opisuje starejšo besedilno skupnost. Po tretji migraciji moderator uporablja `/community/moderation`; pravila in nastavitev so v razdelku 7. SQL pregled ostane možen za lastnika projekta.

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

## 6. Objava na Vercelu

1. V [Vercelu](https://vercel.com/new) uvozi GitHub repozitorij `ahoier-eu/Ahoier`. Izberi ogrodje **Next.js**, korensko mapo projekta `./` in privzeti ukaz za gradnjo. Lokalnih skriptov `npm run dev` in `npm start`, ki poslušata samo na `127.0.0.1:3010`, ne nastavljaj kot ukaza za Vercel.
2. V nastavitvah projekta **Environment Variables** za **Production** nastavi `NEXT_PUBLIC_SUPABASE_URL` in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` s podatki svojega Supabase projekta. V Vercel ne kopiraj `.env.local` in ne dodajaj `service_role`, secret ključa ali gesla baze. Ti dve javni vrednosti sta vgrajeni med gradnjo; po vsaki spremembi spremenljivk sproži novo objavo.
3. Ko poznaš končno HTTPS domeno, v **Supabase → Authentication → URL Configuration** nastavi `Site URL` na njen izvor, na primer `https://ahoier.example`, in med **Redirect URLs** dodaj točen naslov `https://ahoier.example/community`. Če pozneje uporabiš lastno domeno, dodaj tudi njen `/community` in posodobi `Site URL`. Lokalna naslova iz razdelka 1 lahko ostaneta dovoljena. Ahoier prijavni e-poštni povezavi sam poda izvor strani in pot `/community`; `/auth/callback` ni potreben.
4. Predogledne Vercel objave dobijo drugačne naslove. Če v njih preverjaš prijavo, omogoči spremenljivki tudi za **Preview** ter v Supabase dovoli njihove točne naslove `/community` ali [ustrezen vzorec za Vercel](https://supabase.com/docs/guides/auth/redirect-urls#vercel-preview-urls). Predogled, ki kaže na isti Supabase projekt, uporablja tudi iste resnične uporabnike in objave; za izoliran preizkus uporabi ločen Supabase projekt.

Pred javno uporabo preveri vse migracije iz tega dokumenta, vsaj eno plovbo, moderatorski račun in čiščenje medijev. E-poštna povezava se mora vrniti na **dejansko produkcijsko domeno**. Z dvema resničnima testnima računoma preveri imenik, prošnjo za prijateljstvo, zasebno sporočilo, blokado in prijavo vsebine. `/demo` je še vedno lokalen predogled v brskalniku, `/dates` pa ločen lokalni prototip. **`/pilot` je na Vercelu izklopljen**: uporablja lokalno datoteko SQLite, [Vercelove funkcije pa nimajo trajnega skupnega datotečnega sistema](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

Uradna referenca: [Supabase RLS in dovoljenja](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [upravljanje ključev](https://supabase.com/docs/guides/getting-started/api-keys).

## 7. Družabna stena: moderacija in čiščenje fotografij

Tretja migracija ustvari zasebni bucket `ahoier-media` ter pravila za fotografije in družabne podatke. Obstoječe besedilne objave ostanejo. Prijavljen odrasel uporabnik vidi imena in profilne fotografije vseh članov svoje plovbe, ker je imenik namenoma odprt; članstvo ni preverjena rezervacija. Prijateljstva in zasebni pogovori ostanejo tudi po plovbi. Starost 18+ je **samo uporabnikova izjava**.

V SQL Editorju kot lastnik dodaj moderatorski račun z njegovim Auth UUID:

```sql
insert into ahoier_private.ahoier_moderators (user_id)
values ('UUID_MODERATORJA')
on conflict do nothing;
```

Moderator se z običajnim e-poštnim računom prijavi v `/community` in odpre `/community/moderation`. Vidi samo prijavljene objave, Stories in posamezna prijavljena zasebna sporočila, lahko prijavo zavrne, vsebino skrije ali račun omeji. Samo odstranitev članstva ne omeji dostopa, ker se uporabnik lahko znova pridruži. Pred širšo uporabo določi osebo, ki bo prijave dejansko pregledovala.

Potekle Stories in odstranjene fotografije čisti Supabase Edge Function [`ahoier-media-cleanup`](../supabase/functions/ahoier-media-cleanup/index.ts). Klic prek Supabase Cron uporablja projektni secret ključ; spodaj opisana zunanja možnost uporablja namenski žeton. Datoteke funkcija odstranjuje prek Storage API. Objave in odgovori izginejo iz pogleda takoj po odstranitvi; odprte prijave zadržijo pripadajoče fotografije za pregled. Ročna namestitev v [Supabase Dashboardu](https://supabase.com/docs/guides/functions/quickstart-dashboard):

1. V projektu `eaoyqyegfyejywfvujyr` odpri **Edge Functions → Deploy a new function → Via Editor**. Funkcijo poimenuj **točno** `ahoier-media-cleanup`, predlogo zamenjaj s celotno vsebino datoteke [`index.ts`](../supabase/functions/ahoier-media-cleanup/index.ts) in klikni **Deploy function**. Vir v repozitoriju ostane merodajen za poznejše posodobitve.
2. V zavihku **Details** te funkcije izklopi **Verify JWT with legacy secret**. Pri ročni namestitvi se nastavitev iz [`config.toml`](../supabase/config.toml) ne prenese samodejno; klice prek Supabase Cron funkcija še vedno preverja v načinu `secret`. [Secret ključ v glavi `apikey` in izklop vgrajenega JWT preverjanja](https://supabase.com/docs/guides/functions/auth) sta potrebna za ta način klicanja.
3. V **Database → Extensions** omogoči `pg_net`, v **Integrations → Cron** pa `pg_cron`, če še nista vključena. V [Supabase Vault](https://supabase.com/docs/guides/database/vault) prek njegovega vmesnika ustvari skrivnosti `ahoier_project_url` z vrednostjo `https://eaoyqyegfyejywfvujyr.supabase.co` in `ahoier_cleanup_secret_key` z **Secret API key** iz **Settings → API Keys**. Za drugo skrivnost ne uporabi publishable ključa. Secret ključa ne vnašaj v klepet, Git ali odjemalsko aplikacijo.
4. Kot lastnik v SQL Editorju izvedi [`ahoier_media_cleanup.sql`](../supabase/cron/ahoier_media_cleanup.sql). Opravilo kliče funkcijo vsakih 15 minut; datoteka nastavi 60-sekundno omejitev HTTP klica, ker privzeti dve sekundi ne zadoščata za več fotografij. Če si starejšo različico že izvedel z istim lastniškim računom, jo izvedi znova: poimenski `cron.schedule` posodobi obstoječe opravilo. Stanje preveri z `select jobname, schedule, active from cron.job where jobname = 'ahoier-media-cleanup';`. Po prvem zagonu preveri **Edge Functions → ahoier-media-cleanup → Invocations** (HTTP 200, odgovor `{"removed":0,"failed":0}` je ob prazni vrsti normalen). Uspeh opravila v **Cron** pomeni le, da je `pg_net` oddal asinhroni HTTP klic; sam še ne potrjuje odziva funkcije. [Urnik s `pg_cron`, `pg_net` in Vault](https://supabase.com/docs/guides/functions/schedule-functions).

Zasebni bucket ni zagotovilo, da član ne more shraniti fotografije, ki jo vidi. Ahoier zato ob deljenju opozori, da se lahko plovbi pridruži vsak prijavljen odrasel uporabnik. Pri preverjanju uporabi ločen testni projekt ali testne račune in preveri, da uporabnik brez članstva ne more brati medijev druge plovbe.

### Alternativa: cron-job.org brez Supabase Cron

Če Supabase Cron ni na voljo, lahko isto funkcijo kliče [cron-job.org](https://cron-job.org/en/faq/) vsakih 15 minut. Za to pot **ne potrebuješ** `pg_cron`, `pg_net`, skrivnosti v Vaultu ali datoteke `ahoier_media_cleanup.sql`. Zunanji storitvi **ne posreduj** projektnega `sb_secret_...` ključa: ta obide RLS v celotni bazi. Posreduj ji samo namenski naključni žeton za to funkcijo.

1. Na svojem računalniku v PowerShellu ustvari 32-bajtni žeton in ga kopiraj v odložišče brez izpisa v terminal: `node -p "require('node:crypto').randomBytes(32).toString('hex')" | Set-Clipboard`. Žetona ne zapisuj v repozitorij ali klepet.
2. V Supabase odpri **Edge Functions → Secrets**. Dodaj ključ `AHOIER_CLEANUP_CRON_SECRET`, za vrednost prilepi žeton in shrani. To so **Edge Function Secrets**, ne Database Vault; funkcije novo vrednost prejmejo brez ponovne objave. [Supabase: skrivnosti funkcij](https://supabase.com/docs/guides/functions/secrets).
3. V **Edge Functions → ahoier-media-cleanup → Code** zamenjaj kodo z zadnjo različico [`index.ts`](../supabase/functions/ahoier-media-cleanup/index.ts) in jo ponovno objavi. V **Details** mora **Verify JWT with legacy secret** ostati izklopljen. Funkcija najprej preveri namenski žeton in šele nato uporabi administratorski dostop. Veljaven projektni secret ključ v `apikey` še vedno deluje za morebitni obstoječi Supabase Cron. [Supabase: zunanja avtentikacija funkcij](https://supabase.com/docs/guides/functions/auth).
4. V [cron-job.org](https://cron-job.org/) ustvari opravilo **Ahoier media cleanup**: URL `https://eaoyqyegfyejywfvujyr.supabase.co/functions/v1/ahoier-media-cleanup`, metoda **POST**, urnik vsakih 15 minut oziroma minute **0, 15, 30, 45** vsako uro. V naprednih nastavitvah dodaj HTTP glavo `X-Ahoier-Cleanup-Token` z vrednostjo istega žetona. Žetona ne vstavljaj v URL. Po želji vključi shranjevanje odgovorov in e-poštno obvestilo ob neuspehu. [cron-job.org: glave, POST in zgodovina](https://cron-job.org/en/faq/).
5. Sproži testni klic v cron-job.org in preveri **HTTP 200** ter odgovor `{"removed":0,"failed":0}` (ali večje število odstranjenih datotek). Če je odgovor **401**, je žeton napačen ali koda še ni posodobljena; **503** pomeni, da skrivnost v funkciji manjka ali da brisanje ni uspelo. V Supabase lahko isto izvedbo preveriš pod **Edge Functions → ahoier-media-cleanup → Invocations**. Čiščenje briše največ 100 datotek na zagon v manjših Storage paketih, kar zmanjša tveganje prekoračitve časovne omejitve zunanjega urnika.

Uporabljaj samo **en aktivni urnik**. Če si že ustvaril isto opravilo v Supabase Cron, ga po uspešnem preizkusu cron-job.org odstrani v SQL Editorju: najprej preveri `select jobname, active from cron.job where jobname = 'ahoier-media-cleanup';`, in samo če poizvedba vrne vrstico, izvedi `select cron.unschedule('ahoier-media-cleanup');`. To je uporabno tudi, ko zaslon Jobs ne deluje. Ne izklapljaj celotne razširitve `pg_cron`, saj to izbriše vsa njena opravila.

## 8. Profili, obvestila in starejše objave

Za kratek opis, interese in obvestila po že izvedenih prvih treh migracijah v **Supabase SQL Editorju kot lastnik projekta** izvedi celotno četrto migracijo [`20261005000000_ahoier_profile_notifications.sql`](../supabase/migrations/20261005000000_ahoier_profile_notifications.sql). Datoteko lahko varno izvedeš ponovno. Ne ustvarja vzorčnih oseb, objav ali obvestil in ne zahteva novih ključev ali opravila Cron. Predhodni podatki ostanejo.

Preveri, da je migracija uspešna:

```sql
select to_regclass('public.ahoier_notifications') is not null as notifications_ready,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'ahoier_profiles'
                 and column_name = 'bio') as bio_ready,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'ahoier_profiles'
                 and column_name = 'interests') as interests_ready;
```

Vse tri vrednosti morajo biti `true`. Obvestila nastajajo šele ob novih dejanskih prošnjah za prijateljstvo, odgovorih, odzivih in sporočilih; stare aktivnosti se ne pretvorijo v navidezna obvestila. Starejše objave in profilni arhiv se nalagajo po potrebi s trenutnimi pravili RLS. Pred objavo preveri z dvema prijavljenima odraslima računoma in ločenima plovbama, da obvestilo odpre samo dovoljeno vsebino ter da profil in stena pravilno naložita naslednjo stran.
