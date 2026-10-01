# Preverjanje začetne različice — 30. 9. 2026

- Produkcijska gradnja Next.js uspešna.
- ESLint: brez napak in opozoril v projektni kodi.
- TypeScript: brez napak.
- 4 avtomatizirani testi: CSV, datumi, podvojeni postanki, uvoženi podatki za 11 ladij.
- Ob namestitvi npm audit: 0 znanih ranljivosti. To ni celovit varnostni pregled.
- Chrome: prikaz pri širinah 1440 in 390 px, brez vodoravnega prelivanja ali zaznanih JavaScript izjem.
- Preverjeno: nalaganje fotografije, navigacija na merkliste, shranjevanje pristanišča, dialog izbora potovanja, sprememba ladje, ohranitev izbora po osvežitvi, prazno stanje brez itinerarja.
- Neveljaven izbor ladje na API vrne HTTP 400.

Posnetka v `screenshots/desktop.png` in `screenshots/mobile.png` prikazujeta začetno stran. Pregled ni celovit test dostopnosti ali vseh naprav. Objave na gostovanje ni bilo.

## Družabna različica

- 8 avtomatiziranih testov: poleg itinerarjev še omejitev mest in enkratne prijave, odjava, odpoved, preverjanje vnosov srečanja in obnova/ločevanje lokalnih podatkov.
- Chrome 1440 px in 390 px: brez JavaScript izjem; vseh pet razdelkov brez vodoravnega prelivanja.
- Preverjen tok: zahteva za prikazno ime → shranjen profil → ustvarjeno srečanje → prijava → lokalno sporočilo → objava in odgovor → osvežitev in ohranjena vsebina.
- Preverjeno: odjava, odpoved lastnega srečanja, onemogočene nove skupinske objave po odpovedi, ločeni potovalni prostori, okrevanje po poškodovanem localStorage in dostop do starega itinerarja na `/reise`.
- Posnetka nove različice: `screenshots/community-desktop.png` in `screenshots/community-mobile.png`.
- Prava dostava sporočil, strežniška avtorizacija, članstvo in moderacija niso implementirani ali preverjeni. To je lokalni prototip, ne produkcijska skupnost.

## Ahoi Radar

- 11 avtomatiziranih testov skupaj, vključno z izbiro dejavnosti, izločanjem polnih in odpovedanih srečanj ter vplivom profilnih interesov na vrstni red.
- Chrome: prehod iz radarskega predloga na filtrirano srečanje; prazno stanje in predizpolnjeno novo povabilo; izbira pogovornega vprašanja in predizpolnjena objava; preverjen vmesnik pri 1440 in 390 px brez vodoravnega prelivanja ali JavaScript izjem.
- Posnetka: `screenshots/ahoier-radar-desktop.png` in `screenshots/ahoier-radar-mobile.png`.
- Radar uporablja zgolj besedilo lokalno prikazanih srečanj. Ne povezuje resničnih gostov in ne kaže aktivnosti v živo.

## Ahoi Dates

- 13 avtomatiziranih testov skupaj; dodana sta preverjanje polnoletnosti in starostnega razpona ter varna obnova lokalnega zapisa.
- Chrome: dostop iz profila; zavrnjen vnos mladoletne starosti; shranjevanje, urejanje in brisanje podatkov. Po izklopu je ključ `ahoier:dates:v1` odstranjen.
- Preverjen mobilni prikaz pri 390 px brez vodoravnega prelivanja in JavaScript izjem. Posnetki v `screenshots/ahoi-dates-desktop.png`, `screenshots/ahoi-dates-mobile.png` in `screenshots/ahoi-dates-form-mobile.png`.
- To ni dejanska storitev za spoznavanje: ni preverjanja starosti, potovanja, drugih profilov, ujemanj ali sporočil drugim gostom.

## Povabljeni pilot

- 33 avtomatiziranih testov skupaj; uspešni so bili tudi ESLint, TypeScript in produkcijska gradnja Next.js.
- Dva ločena brskalnika sta potrdila skupno srečanje in zasedenost mest. Prekoračitev kapacitete je vrnila HTTP 409, tuji izvor HTTP 403.
- Preverjeni so bili prijava vsebine, ponovna prijava z osebno kodo, zamenjava razkrite kode brez izgube prijav ter moderatorsko skrivanje srečanja.
- Mobilna pogleda pri 390 in 375 px nista imela vodoravnega prelivanja ali JavaScript izjem. Posnetki so v `screenshots/ahoier-pilot-*.png`.
- Preizkus je uporabljal ločeno bazo z izmišljenimi gosti. Produkcijskega gostovanja ali članstva na resnični plovbi ni bilo.
