# ✦ Zvone AI Studio

Vlastiti **AI kreativni studio** s tamnim responzivnim sučeljem, generiranjem slika, prepravkama fotografija, izradom videa iz opisa ili fotografije, uređivanjem videa i osobnom galerijom.

**GitHub:** https://github.com/zvonebeslic/aistudio

## Što radi

- **Generiraj slike** iz opisa preko modela Google Nano Banana 2.1 / Lite / 2 / Pro ili OpenAI GPT Image 2.5 Sunburst / Flare.
- **Uredi fotografije:** dodaj do četiri referentne slike ili učitaj prethodno generirani rad iz galerije, napiši promjenu i generiraj novu verziju.
- **Video studio:** Gemini Omni 1.2 Flash generira video s audiozapisom iz teksta ili reference. Odabir 5, 8, 10 ili 15 sekundi, vertikalno ili horizontalno.
- **Uredi video:** učitaj MP4, WEBM ili MOV i opiši izmjene (Gemini Omni; dostupnost određuje Google model).
- **Galerija:** lokalno spremljeni radovi, ponovno uređivanje, animiranje fotografija, preuzimanje PNG/JPG/WEBP/MP4 izlaza.
- **Privatnost:** HTTP Basic lozinka štiti cijeli studio. API ključevi ostaju isključivo na backendu. Nijedan pravi ključ ne smije se commitati.

> Ovo je *vlastita aplikacija koja poziva AI modele preko službenih API-ja*, a ne lokalno trenirani ili neograničeni model. Kvaliteta, dozvoljene radnje, dostupnost i cijena ovise o odabranom pružatelju usluga. Odgovori modela mogu biti odbijeni prema pravilima pružatelja.

## Lokalni start

Treba **Node.js 20+** i npm.

```bash
git clone https://github.com/zvonebeslic/aistudio.git
cd aistudio
npm install
cp .env.example .env
# u datoteci .env popuni STUDIO_PASSWORD i API ključeve
npm start
```

Otvori **http://localhost:3000**. Preglednik će, ako je STUDIO_PASSWORD zadan, tražiti korisnika i lozinku: korisničko ime može biti bilo što, lozinka je vrijednost `STUDIO_PASSWORD`.

Primjer konfiguracije (`.env` nemoj objavljivati):

```dotenv
PORT=3000
STUDIO_PASSWORD=ovdje-duga-jedinstvena-lozinka
GEMINI_API_KEY=ovdje-gemini-kljuc
OPENAI_API_KEY=ovdje-openai-kljuc
DATA_DIR=./data
```

Dovoljan je **jedan** od AI ključeva za odgovarajuće modele. Za video je potreban **GEMINI_API_KEY**.

API ključeve možeš izraditi na:
- Google AI Studio: https://aistudio.google.com/apikey
- OpenAI Platform: https://platform.openai.com/api-keys

Napomena: API promet se može posebno naplaćivati, neovisno o pretplati na ChatGPT. Uređivanje slika te video možda zahtijevaju naplatu na povezanim računima.

## Online postavljanje

**GitHub Pages nije dovoljan.** Backend poziva API-je i skriva ključeve. Primjeri podržanog pristupa:

1. Postavi repozitorij na Node.js hosting poput Railwayja, Rendera, Hostinger VPS-a ili vlastitog poslužitelja.
2. Podesi naredbu `npm install` za build i `npm start` za start.
3. U postavkama hostinga dodaj **`STUDIO_PASSWORD`**, **`GEMINI_API_KEY`** i/ili **`OPENAI_API_KEY`**, `NODE_ENV=production`.
4. Obavezno koristi **HTTPS** za prijenos Basic lozinke, i **persistent volume** za direktorij određen varijablom `DATA_DIR`. Bez trajnog diska galerija će nestati pri ponovnom pokretanju ili redeployu.
5. Otvori adresu aplikacije i prijavi se. U **Postavke** provjeri statuse spojenih pružatelja usluga.

Za Hostinger dijeljeni hosting provjeri podršku za Node.js i dugotrajne HTTP zahtjeve. VPS je najpredvidljiviji izbor. U ovoj verziji video-zadaci žive u memoriji Node procesa, stoga restart servera prekida generiranje u tijeku.

## Sigurnosne napomene

- `.env`, `data/` i `node_modules/` ignoriraju se u Gitu.
- Studio je namijenjen **jednom korisniku / osobnoj uporabi**. Za javnu višekorisničku uslugu potrebna je zasebna autentifikacija, kvote po korisniku, baza i zaštita od zlouporabe.
- Ne uploadaj tuđe fotografije ili videe bez odgovarajućih prava.
- Generator može odbiti neke zahtjeve u skladu s pravilima Googlea ili OpenAI-ja.
- Maksimalno četiri slike do 12 MB po slici; video do 60 MB; najviše 12 zahtjeva u 10 minuta po IP-u.
- Galerija se sprema na disk (`DATA_DIR/media` i `DATA_DIR/gallery.json`). Napravi vlastite sigurnosne kopije ako su radovi važni.

## API rute

| Ruta | Svrha |
| --- | --- |
| `GET /api/status` | status konfiguracije bez izlaganja ključeva |
| `POST /api/generate` | kreiraj AI zadatak (multipart/form-data) |
| `GET /api/jobs/:id` | provjera napretka |
| `GET /api/gallery` | metapodaci spremljenih radova |
| `GET /api/media/:id` | pregled medija |
| `GET /api/media/:id/download` | preuzimanje medija |

## Službena dokumentacija modela

- Google Nano Banana: https://aistudio.google.com/docs/image-generation
- Google Omni Flash: https://aistudio.google.com/docs/omni
- OpenAI slike: https://developers.openai.com/api/docs/guides/image-generation

**Status verzije:** Početna funkcionalna integracija i sučelje. Bez vlastitih API ključeva nije moguće provesti stvarno generiranje ili potvrditi računsku dostupnost modela. Za videoprodukciju u većem opsegu preporučuje se vanjski red zadataka i pohrana u objektni storage.
