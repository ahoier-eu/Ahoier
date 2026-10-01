export const SHIPS = [
  "AIDAbella","AIDAblu","AIDAcosma","AIDAdiva","AIDAluna",
  "AIDAmar","AIDAnova","AIDAperla","AIDAprima","AIDAsol","AIDAstella",
];

// Photos sourced from Wikimedia Commons (all free-licensed: CC BY / CC BY-SA /
// CC0 / Free Art License) — see SHIP_PHOTO_CREDITS below for required
// attribution. Not official AIDA photography.
export const SHIP_PHOTOS: Record<string, string> = {
  AIDAbella:  "/ships/aidabella.jpg",
  AIDAblu:    "/ships/aidablu.jpg",
  AIDAcosma:  "/ships/aidacosma.jpg",
  AIDAdiva:   "/ships/aidadiva.jpg",
  AIDAluna:   "/ships/aidaluna.jpg",
  AIDAmar:    "/ships/aidamar.jpg",
  AIDAnova:   "/ships/aidanova.jpg",
  AIDAperla:  "/ships/aidaperla.jpg",
  AIDAprima:  "/ships/aidaprima.jpg",
  AIDAsol:    "/ships/aidasol.jpg",
  AIDAstella: "/ships/aidastella.jpg",
};

export const SHIP_PHOTO_CREDITS: Record<string, { author: string; license: string; source: string; licenseUrl: string }> = {
  AIDAbella:  { author: "Wolfgang Fricke", license: "CC BY 3.0", source: "https://commons.wikimedia.org/wiki/File:AIDAbella_IMO_9362542_P_Kiel_24-07-2022_(1).jpg", licenseUrl: "https://creativecommons.org/licenses/by/3.0/" },
  AIDAblu:    { author: "Martin Falbisoner", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:AIDAblu_in_Corfu_-_September_2017.jpg", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
  AIDAcosma:  { author: "AK-Bino", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:AIDAcosma_04.jpg", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
  AIDAdiva:   { author: "A.Savin, Wikipedia", license: "Free Art License", source: "https://commons.wikimedia.org/wiki/File:Rostock_asv2018-04_img01_Warnemuende_port.jpg", licenseUrl: "https://artlibre.org/licence/lal/en/" },
  AIDAluna:   { author: "Master0Garfield", license: "CC0 1.0", source: "https://commons.wikimedia.org/wiki/File:AIDAluna_Feb_26_2024.jpg", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" },
  AIDAmar:    { author: "Sebaso", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:2015-03-28_AIDAmar_Hamburg.jpg", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
  AIDAnova:   { author: "kees torn", license: "CC BY-SA 2.0", source: "https://commons.wikimedia.org/wiki/File:AIDAnova_29-04-2024.jpg", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/" },
  AIDAperla:  { author: "Philippe Alès (Palamède)", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Aida_perla,_Le_Havre,_mars_2018_(cropped).jpg", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
  AIDAprima:  { author: "Frans Berkelaar", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:AIDAprima_(ship,_2016)_006.jpg", licenseUrl: "https://creativecommons.org/licenses/by/2.0/" },
  AIDAsol:    { author: "Spike", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Aidasol_Trondheim_001.jpg", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
  AIDAstella: { author: "Rainer Lippert", license: "CC0 1.0", source: "https://commons.wikimedia.org/wiki/File:AIDAstella,_6.jpg", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" },
};
