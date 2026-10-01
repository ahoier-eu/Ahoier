# Ahoier

Samostojen začetni projekt za goste AIDA. Poudarek je na druženju na ladji, srečanjih in izmenjavi informacij med gosti. Začetna stran je **lokalni interaktivni predogled**; po konfiguraciji Supabase se od tam odpre ločena skupna skupnost za povabljene člane potovanja. Ločeni `/pilot` še vedno omogoča preizkus srečanj v lokalni strežniški bazi.

## Lokalni družabni predogled (brez Supabase)

- `/`: začetna stran »An Bord«, srečanja, skupnost, skupinski pogovori in lokalni profil.
- `/reise`: izbor ladje in datumov, itinerar iz vključenega podatkovnega posnetka, pristanišča in priljubljeni postanki.
- Profil: prikazno ime, opis, interesi in neobvezna zasebna izbira, ali gost potuje sam, v paru, z družino ali prijatelji. Za ustvarjanje objav in prijavo na srečanje najprej shrani ime.
- Srečanja: ustvarjanje, prijava/odjava, omejitev mest, iskanje, prikaz lastnih srečanj in odpoved organizatorja. Gost lahko prijavi 1–10 oseb skupaj, pozneje spremeni število mest; zasedenost šteje ljudi, ne profilov. Organizator lahko svoje srečanje označi kot primerno za družine, gostje pa taka srečanja filtrirajo.
- Skupnost: kategorije, nove objave, odgovori, oznaka »koristno« in lokalno skrivanje vsebine.
- Pogovori: lokalno shranjevanje sporočil pri srečanjih, ki se jim je uporabnik pridružil. Pri odpovedanem srečanju je vnos onemogočen.
- Vsebina je ločena po ladji in izbranem datumskem razponu. To še ni identifikator potrjenega križarjenja ali preverjeno članstvo.
- Ob prvem odpiranju so vidni jasno označeni primeri s fiktivnimi gosti, vključno z družinam primernim srečanjem. Nobeno prikazano srečanje ni uradni dogodek na ladji. Pri ponastavitvi se primeri obnovijo.
- Družabna začetna stran najprej pokaže izbrano ladjo in potovanje ter dve odprti srečanji. Običajno sta urejeni po datumu in uri; če profil navaja družinsko potovanje, imajo prednost srečanja z oznako »Für Familien«. Za njima so kratki dejanji za predlog srečanja ali vprašanje, Radar, tok pogovorov in pregled lastnih dogovorov. Na telefonu je naslednji lasten dogovor prikazan pred srečanji. Hitre ideje so skrite pod povezavo in predizpolnijo obrazec. Če gost ob prijavi še nima imena, se po shranitvi profila vrne k istemu srečanju in prijava se dokonča lokalno.
- Mobilna začetna stran uporablja fotografijo izbrane ladje v nizki kartici potovanja. Srečanja imajo majhne barvne poudarke glede na opis dejavnosti, prijava pa pokaže lokalno potrditev s kratko animacijo, ki upošteva nastavitev za zmanjšano gibanje. Ilustracij ali fotografij izmišljenih gostov ni.
- **Ahoi Radar** pomaga izbrati med prikazanimi prostimi srečanji po vrsti dejavnosti. Pri splošnem pogledu uredi predloge glede na interese iz lokalnega profila; če gost navede, da potuje z družino, da prednost označenim družinskim srečanjem. Ujemanje temelji na besedah iz naslova in opisa ter oznaki družinskega srečanja, ne na informacijah o resničnih gostih. Če ni ujemanja, ponudi predizpolnjen predlog za novo srečanje.
- **Gesprächsimpuls** ponuja šest vprašanj za začetek pogovora. Gost lahko izbere drugo vprašanje ali odpre že izpolnjen obrazec za objavo. Objave še naprej ostanejo v tem brskalniku.
- `/dates`: ločen, prostovoljen predogled **Ahoi Dates** za odrasle, dosegljiv iz profila in brez objav v splošnem toku. Uporabnik lahko določi namen, koga želi spoznati, starostni razpon, svoj status (neobvezno) ter kratek opis. Potrditev polnoletnosti je v prototipu samo lastna izjava. Podatki se hranijo ločeno pod `ahoier:dates:v1`; uporabnik jih lahko kadarkoli v celoti izbriše. Ni drugih profilov, ujemanj, zasebnih sporočil ali preverjanja starosti in potovanja.
- `/pilot`: ločen pilotni prostor za povabljene goste ene izbrane plovbe. Na istem strežniku vidijo ista srečanja; gost lahko predlaga srečanje, potrdi 1–10 mest, se odjavi, po srečanju sam označi udeležbo ali odsotnost oziroma vsebino prijavi upravljavcu pilota. Gostitelj lahko srečanje odpove. Pilot ne vsebuje skupnega klepeta, javnega toka objav ali primerov izmišljenih gostov.

Podatki **lokalne predogledne skupnosti** se hranijo pod `ahoier:community:v1` v localStorage. V njej ni prijave, pošiljanja sporočil drugim ljudem, spletne objave, potisnih obvestil ali dejanske moderacije. Skrivanje vsebine ni prijava moderatorju. Uporaba v več zavihkih istega brskalnika se usklajuje; drugi brskalniki in naprave nimajo skupnih podatkov. Pilotni prostor `/pilot` uporablja ločeno strežniško bazo in je opisan spodaj.

## Skupnost s Supabase

Ko nastaviš `NEXT_PUBLIC_SUPABASE_URL` in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ter izvedeš SQL migracijo, se odpre `/community`: prijava z e-poštnim povezovalnim sporočilom, prikazno ime, vstop v potovanje s povabilom, objave, odgovori in prijava neprimerne vsebine. Začetna stran ostane predogled z jasno povezavo na skupno skupnost. Objave so vidne samo prijavljenim članom iste povabljene skupine. Koda ne potrjuje rezervacije ali identitete. Srečanja ostanejo v ločenem `/pilot`, Ahoi Dates pa lokalni zasebni predogled. Lokalnih profilov in objav ne prenašamo samodejno v Supabase.

Navodila za nastavitev projekta, varnostnih pravil in povabil so v [docs/SUPABASE.md](docs/SUPABASE.md). V `.env.local` sodita samo **Project URL** in **publishable key**; skrivnega ključa ne dodajaj v aplikacijo ali Git.

## Povabljeni pilot

Pilot ustvari upravljavec na svojem strežniku z Node.js 24 in zapisljivo mapo za SQLite. Primer ukaza (datuma zamenjaj z izbrano pilotno plovbo):

```powershell
npm run pilot:setup -- --ship AIDAcosma --from YYYY-MM-DD --to YYYY-MM-DD --time-zone Europe/Berlin --invites 10
```

Upravljavec mora ob ustvarjanju plovbe izbrati časovni pas IANA, ki ustreza predvidenemu ladijskemu času. Izbrani pas je predpostavka za odpiranje in zapiranje prijav; če ladja med plovbo spremeni uro, ta različica tega še ne podpira. Zavezujoči čas gostje potrdijo na krovu.

Ukaz izpiše ID pilota in osebne kode; kode zasebno razdeli posameznim odraslim udeležencem. Gosti nato odprejo `/pilot`, vnesejo kodo in prikazno ime. Ista koda pozneje ponovno odpre **isti** račun tudi na drugi napravi, zato jo je treba hraniti zasebno. Koda omogoči dostop do izbrane skupine, **ne potrjuje rezervacije, identitete ali članstva na ladji**. Strežnik hrani le zgoščene vrednosti kod in sejnih žetonov; seja je v piškotku HttpOnly. Prijave na mesta so strežniško preverjene, zato dva gosta ne moreta preseči kapacitete z istočasno prijavo.

```powershell
npm run pilot:metrics -- --voyage ID_PILOTA
npm run pilot:moderate -- --voyage ID_PILOTA --reports
npm run pilot:moderate -- --voyage ID_PILOTA --rotate-code ID_GOSTA
```

Metrike prikazujejo izdane in uporabljene kode, število srečanj, prijavljenih mest, samoprijavljeno udeležbo oziroma odsotnost in prijave vsebine. Samoprijava ni dokaz dejanske prisotnosti; če je gost prijavil skupino, podatek velja samo za njegov odgovor, ne za vsako osebo v skupini. Poročila iz prijav pregleduje upravljavec lokalno; uporabnikom se ne razkrivajo. Z ukazom `pilot:moderate` lahko upravljavec tudi skrije ali odpove srečanje oziroma prekliče dostop udeležencu (`--hide-meeting ID`, `--cancel-meeting ID`, `--revoke-participant ID`). Če se osebna koda razkrije, `--rotate-code ID_GOSTA` izda novo kodo za istega gosta ter prekliče staro kodo in vse njegove seje, njegova srečanja in prijave pa ostanejo. Novo kodo upravljavec preda zasebno.

Baza je privzeto v `data/ahoier-pilot.sqlite` (lahko jo nastaviš z `AHOIER_PILOT_DB`) in je izključena iz Gita. Pot pod javno mapo `public/` je zavrnjena. Ta izvedba je namenjena **enemu strežniku z obstojnim diskom**, ne več strežniškim replikam ali brezstanjskemu gostovanju. Za povabilo resničnih gostov so potrebni HTTPS, varnostne kopije, dejanski odziv na prijave vsebin in preverjanje dostopa do spletne strani na krovu.

Testna posnetka mobilnega prikaza: [vstop](docs/screenshots/ahoier-pilot-entry-mobile.png) in [skupna srečanja](docs/screenshots/ahoier-pilot-guest-mobile.png).

## Zagon

Priporočeno: Node.js 24 LTS (tudi testi uporabljajo vgrajeno podporo TypeScript).

```powershell
git clone https://github.com/ahoier-eu/Ahoier.git
cd Ahoier
npm install
npm run dev
```

Odpri http://127.0.0.1:3010. Za produkcijski lokalni preizkus: `npm run build`, nato `npm start`.

Repozitorij vključuje `data/itineraries.csv`, zato pregled poti deluje tudi po sveži namestitvi. Gre za posnetek podatkov, ne za sproti posodobljen itinerar. Za uporabo druge datoteke nastavi `AHOIER_ITINERARY_FILE` na njeno pot in znova zaženi strežnik.

## Preverjanje

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

## Podatki in omejitve

- `data/itineraries.csv` je vključen posnetek prej uvoženih itinerarjev iz Locker9. Podatki niso uradni ali sproti posodobljeni; izbor ladje in datumov sestavi pregled zapisov, ne potrjene rezervacije konkretnega križarjenja.
- Časi prihodov in odhodov so prikazani tako kot v viru. Zavezujoči čas vrnitve na ladjo mora gost preveriti na krovu.
- Risba poti je shematska; povezave na OpenStreetMap odprejo lokacijo pristanišča, ne potrjenega priveza.
- Fotografije ladij so predogledi z Wikimedia Commons. Natančni viri, avtorji, licence in opomba o pomanjšanju so v [pripisih fotografij](docs/SHIP_PHOTO_CREDITS.md); povezave za trenutno ladjo so tudi v nogi strani. Te licence veljajo za posamezne fotografije, ne za celotno aplikacijo.
- Izbor potovanja in priljubljena pristanišča se shranijo samo v brskalniku. Supabase skupnost ima ločen račun in podatke; plačil ali prenosa osebnih podatkov posadke ni.
- Tipografija uporablja lokalno shranjeni Bricolage Grotesque (naslovi) in Plus Jakarta Sans (besedilo) z nadomestno sistemsko pisavo. Izvor: repozitorij google/fonts; licenci OFL sta priloženi v public/fonts. Zunanji zemljevid se odpre šele s klikom povezave.
- Projekt ni uradna aplikacija AIDA. Iskalnikom je nastavljen `noindex`, ker gre za začetno različico.

## Naslednja faza: prava skupnost

Pred javno uporabo preveri produkcijsko gostovanje in konfiguracijo Supabase, postopek osveževanja itinerarjev, pravne vsebine ter pravice za fotografije in znamke. Supabase povabilo omeji dostop do potovalne skupine, ne preveri pa rezervacije ali identitete; odziv na prijave vsebin je še vedno treba organizirati. Ločeni pilot srečanj nima samopostrežne obnove računa, stalne moderacijske ekipe ali infrastrukture za več strežnikov. Za širšo produkcijsko skupnost potrebujemo preverjanje članstva, zanesljivo moderiranje, zasebnost in operativno podporo.

Pred javno skupnostjo potrebujemo tudi natančnejši ladijski čas za celotno pot, pravila za pretekle objave ter vir uradnega programa na ladji. Ura srečanja je vnos gostitelja, ne potrjen uradni čas. Zasebni stiki, javni imenik gostov, otroški profili in rezervacije še niso vključeni. Družinska prijava hrani samo število mest pri odraslem gostu, ne imen ali starosti otrok; v pilotu zasedbo preverja strežnik, v lokalnem predogledu pa ostane v brskalniku.

Pred dejanskim zagonom Ahoi Dates posebej uredimo preverjanje polnoletnosti, zasebnost občutljivih želja, obojestransko potrditev stika, blokiranje, prijave in upravljanje zlorab. Zasebnih podatkov iz predogleda ne prenašamo samodejno v prihodnje javne profile.

Locker9 ostaja ločen projekt; njegove poverilnice in uporabniški podatki niso vključeni.
