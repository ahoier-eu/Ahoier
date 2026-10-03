# Ahoier

Samostojen začetni projekt za goste AIDA. Poudarek je na druženju na ladji, srečanjih in izmenjavi informacij med gosti. Začetna stran `/` je kratek javni vhod v Ahoier; `/demo` je jasno označen lokalni interaktivni predogled, `/community` pa skupna Supabase skupnost, v kateri si prijavljen gost sam izbere plovbo. Ločeni `/pilot` še vedno omogoča preizkus srečanj v lokalni strežniški bazi.

## Lokalni družabni predogled (brez Supabase)

- `/demo`: lokalna družabna stena s Stories, objavami, ljudmi in sporočili; srečanja in skupinski pogovori ostanejo dosegljivi iz dodatne navigacije. Začetna stran `/` jasno vodi v pravo skupnost ali predogled.
- `/reise`: izbor ladje in datumov, itinerar iz vključenega podatkovnega posnetka, pristanišča in priljubljeni postanki.
- Profil: prikazno ime, neobvezna fotografija, opis, interesi in zasebna izbira, ali gost potuje sam, v paru, z družino ali prijatelji. Pred družabnimi dejanji shrani ime in potrdi 18+.
- Srečanja: ustvarjanje, prijava/odjava, omejitev mest, iskanje, prikaz lastnih srečanj in odpoved organizatorja. Gost lahko prijavi 1–10 oseb skupaj, pozneje spremeni število mest; zasedenost šteje ljudi, ne profilov. Organizator lahko svoje srečanje označi kot primerno za družine, gostje pa taka srečanja filtrirajo.
- Skupnost: objave z največ štirimi fotografijami, odgovori z eno fotografijo, pet emoji odzivov, lokalno skrivanje vsebine in 24-urne Stories.
- Pogovori: lokalna simulacija prijateljstev in zasebnih sporočil ter skupinski pogovori pri srečanjih. Izmišljene osebe ne prejmejo sporočil; pri odpovedanem srečanju je vnos onemogočen.
- Vsebina je ločena po ladji in izbranem datumskem razponu. To še ni identifikator potrjenega križarjenja ali preverjeno članstvo.
- Ob prvem odpiranju je vidnih 20 jasno označenih fiktivnih oseb in primeri srečanj, vključno z družinam primernim srečanjem. Nobena prikazana oseba ni resnični gost; nobeno srečanje ni uradni dogodek na ladji. Pri ponastavitvi se primeri obnovijo.
- Družabna stena najprej pokaže izbrano plovbo, Stories, hiter vnos objave in pogovore. Srečanja imajo ločen zavihek, kjer so urejena po datumu in uri; družinski profil da prednost srečanjem z oznako »Für Familien«. Če gost še nima imena, se po shranitvi profila vrne k začetemu dejanju.
- Na telefonu je spodnja navigacija omejena na štiri glavne poti: steno, ljudi, sporočila in profil. Vzorčna fotografija ladje ni predstavljena kot fotografija izmišljenega gosta; srečanja imajo barvne poudarke in lokalna potrditev prijave upošteva nastavitev za zmanjšano gibanje.
- **Ahoi Radar** pomaga izbrati med prikazanimi prostimi srečanji po vrsti dejavnosti. Pri splošnem pogledu uredi predloge glede na interese iz lokalnega profila; če gost navede, da potuje z družino, da prednost označenim družinskim srečanjem. Ujemanje temelji na besedah iz naslova in opisa ter oznaki družinskega srečanja, ne na informacijah o resničnih gostih. Če ni ujemanja, ponudi predizpolnjen predlog za novo srečanje.
- **Gesprächsimpuls** ponuja šest vprašanj za začetek pogovora. Gost lahko izbere drugo vprašanje ali odpre že izpolnjen obrazec za objavo. Objave še naprej ostanejo v tem brskalniku.
- `/dates`: ločen, prostovoljen predogled **Ahoi Dates** za odrasle, dosegljiv iz profila in brez objav v splošnem toku. Uporabnik lahko določi namen, koga želi spoznati, starostni razpon, svoj status (neobvezno) ter kratek opis. Potrditev polnoletnosti je v prototipu samo lastna izjava. Podatki se hranijo ločeno pod `ahoier:dates:v1`; uporabnik jih lahko kadarkoli v celoti izbriše. Ni drugih profilov, ujemanj, zasebnih sporočil ali preverjanja starosti in potovanja.
- `/pilot`: ločen pilotni prostor za povabljene goste ene izbrane plovbe. Na istem strežniku vidijo ista srečanja; gost lahko predlaga srečanje, potrdi 1–10 mest, se odjavi, po srečanju sam označi udeležbo ali odsotnost oziroma vsebino prijavi upravljavcu pilota. Gostitelj lahko srečanje odpove. Pilot ne vsebuje skupnega klepeta, javnega toka objav ali primerov izmišljenih gostov.

Podatki **lokalne predogledne skupnosti** se hranijo pod `ahoier:community:v1` v localStorage, naložene predogledne fotografije pa v IndexedDB. Predogled vključuje jasno označene izmišljene osebe, Stories, odzive in simulirane zasebne pogovore; nobeno sporočilo ne doseže druge osebe. Ni spletne objave, potisnih obvestil ali dejanske moderacije. Uporaba v več zavihkih istega brskalnika se usklajuje; drugi brskalniki in naprave nimajo skupnih podatkov.

Posnetki predogleda: [mobilna stena](docs/screenshots/ahoier-social-wall-mobile.png), [namizna stena](docs/screenshots/ahoier-social-wall-desktop.png) in [mobilna prijava](docs/screenshots/ahoier-social-signin-mobile.png).

## Skupnost s Supabase

Ko nastaviš `NEXT_PUBLIC_SUPABASE_URL` in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ter izvedeš **vse tri** SQL migracije, se odpre `/community`: prijava s povezavo po e-pošti, lastna potrditev 18+, izbor plovbe, družabna stena s fotografijami in emoji odzivi, 24-urne Stories, imenik članov, prijateljstva ter zasebna sporočila med potrjenimi prijatelji. Profilna fotografija je neobvezna. Prijavljeno vsebino lahko moderator pregleda na `/community/moderation`. Vzorčne osebe ostanejo izključno na `/demo`. Vsak prijavljen odrasel uporabnik se lahko pridruži katerikoli plovbi, ki jo je ustvaril upravljavec; izbor **ni dokaz** rezervacije, identitete ali prisotnosti na ladji. Srečanja ostanejo v ločenem `/pilot`, Ahoi Dates pa lokalni zasebni predogled. Lokalnih profilov in objav ne prenašamo samodejno v Supabase.

Mobilna zasnova `/community` in `/demo` sledi [odobrenemu mockupu](docs/mockups/ahoier-social/README.md): kratka naslovnica izbrane plovbe, vidni člani in Stories, strnjen vnos objave ter profil gosta s fotografijo, prijateljskim dejanjem in dejansko vsebino. Pravi profil trenutno ne hrani opisa ali interesov iz statičnega primera.

Navodila za nastavitev projekta, varnostnih pravil, plovb, moderatorja, čiščenja fotografij in [objavo na Vercelu](docs/SUPABASE.md#6-objava-na-vercelu) so v [docs/SUPABASE.md](docs/SUPABASE.md). V `.env.local` sodita samo **Project URL** in **publishable key**; skrivnega ključa ne dodajaj v aplikacijo ali Git. Kode v ločenem pilotu `/pilot` ostanejo del njegovega lastnega sistema.

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

Baza je privzeto v `data/ahoier-pilot.sqlite` (lahko jo nastaviš z `AHOIER_PILOT_DB`) in je izključena iz Gita. Pot pod javno mapo `public/` je zavrnjena. Ta izvedba je namenjena **enemu strežniku z obstojnim diskom**, ne več strežniškim replikam ali brezstanjskemu gostovanju. Pri `npm start` na takem strežniku nastavi `AHOIER_PILOT_ENABLED=1`; na Vercelu je pilot vedno izklopljen. Za povabilo resničnih gostov so potrebni HTTPS, varnostne kopije, dejanski odziv na prijave vsebin in preverjanje dostopa do spletne strani na krovu.

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

Pred javno uporabo preveri produkcijsko gostovanje in konfiguracijo Supabase, e-poštno prijavo, izvajanje čiščenja fotografij, odziv moderatorja na prijave, postopek osveževanja itinerarjev ter pravne vsebine in pravice za fotografije in znamke. Skupnosti posameznih plovb so odprte za vse prijavljene odrasle uporabnike, zato izbor plovbe ne preverja rezervacije ali identitete. Sama odstranitev članstva ni trajna omejitev, ker se uporabnik lahko znova pridruži; moderatorska omejitev računa je ločena. Ločeni pilot srečanj nima infrastrukture za več strežnikov.

Pred širšo javno skupnostjo potrebujemo tudi natančnejši ladijski čas za celotno pot, pravila za pretekle objave ter vir uradnega programa na ladji. Ura srečanja je vnos gostitelja, ne potrjen uradni čas. Otroški profili in rezervacije niso vključeni. Družinska prijava hrani samo število mest pri odraslem gostu, ne imen ali starosti otrok; v pilotu zasedbo preverja strežnik, v lokalnem predogledu pa ostane v brskalniku.

Pred dejanskim zagonom Ahoi Dates posebej uredimo preverjanje polnoletnosti, zasebnost občutljivih želja, obojestransko potrditev stika, blokiranje, prijave in upravljanje zlorab. Zasebnih podatkov iz predogleda ne prenašamo samodejno v prihodnje javne profile.

Locker9 ostaja ločen projekt; njegove poverilnice in uporabniški podatki niso vključeni.
