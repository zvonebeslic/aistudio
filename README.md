# ✦ Zvone AI Studio

## Otvori web

**Web stranica:** https://zvonebeslic.github.io/aistudio/

**Glavni web-kod je u samom korijenu repozitorija**, kao kod KvizToGo i Mountain Adventures: `index.html`, `editor.html`, `video.html`, `style.css`, `app.js` itd.

**Kako se objavljuje:** GitHub Pages u ovom repozitoriju već je postavljen na `main/docs`. Zato automatski workflow `.github/workflows/sync-pages.yml` kopira HTML/CSS/JS iz korijena u `docs/` nakon svakog ažuriranja glavnih web-datoteka. Korijen je izvorni kod koji uređuješ, a `docs/` objavljena kopija.

**Za buduće izmjene:** uređuj `index.html` i ostale datoteke u korijenu. Nemoj ručno uređivati kopije u `docs/`, jer će ih sinkronizacija zamijeniti.

**Tvoj vlastiti AI studio s javnim izvornim kodom i stvarnim alatima za obradu fotografija i videa.**

- **🌐 Web aplikacija:** https://zvonebeslic.github.io/aistudio/
- **📸 Foto editor:** https://zvonebeslic.github.io/aistudio/editor.html
- **🎬 Video editor:** https://zvonebeslic.github.io/aistudio/video.html
- **📂 Izvorni kod:** https://github.com/zvonebeslic/aistudio

## Što radi na GitHub Pagesu, odmah i bez ključa

| Funkcija | Status |
| --- | --- |
| Učitaj i uredi JPG, PNG, WEBP, AVIF fotografiju | ✅ Lokalno |
| Izreži (1:1, 9:16, 16:9, 4:3…), rotiraj, zrcali | ✅ Lokalno |
| Svjetlina, kontrast, zasićenje, ton, sepia, crno-bijelo, blur | ✅ Lokalno |
| Dodaj tekst i crtaj prstom/mišem | ✅ Lokalno |
| Poništi/vrati, izvezi PNG/JPG/WEBP | ✅ Lokalno |
| Učitaj video, skraćivanje, brzina, boje, natpisi | ✅ Lokalno |
| Izvezi video preko MediaRecodera | ✅ Na podržanim preglednicima |
| Galerija s pregledom, brisanjem, uređivanjem i preuzimanjem | ✅ Lokalni IndexedDB |
| AI generiranje i prepravke slika uz Gemini | ✅ Nakon osobnog API ključa i omogućena Google API pristupa |
| AI tekst/slika → video, video → video | ✅ Pokušaj preko Gemini Omni, ovisi o modelu, regiji i API pristupu |

### Osobno AI generiranje izravno na Pagesu

1. Otvori https://aistudio.google.com/apikey i izradi **vlastiti** Gemini API ključ.
2. Otvori web aplikaciju, klikni **Poveži AI** → **Postavke**.
3. Unesi ključ i odaberi **Poveži Gemini**.
4. Vrati se na **Generiranje slika**, **AI prepravka fotografije**, **Video studio** ili **AI prepravka videa**.
5. Odaberi model (Nano Banana 2.1 / 2 Lite / Pro / Classic ili Gemini Omni 1.1 Flash), napiši prompt i generiraj.
6. Rezultat možeš preuzeti i spremit će se u **Galeriju** preglednika.

⚠️ **Sigurnost:** Google preporučuje backend proxy za produkcijsku upotrebu. Ovaj pristup, *Bring Your Own Key*, služi **samo osobnom korištenju**: svoj ključ ručno upisuješ u preglednik i on se šalje Google API-ju. Ne sprema se u `localStorage`, `IndexedDB`, GitHub kod niti cookie; zadržava se samo u memoriji trenutačne kartice. Ipak, preglednički alati i skripte na toj stranici mogu mu pristupiti. **Nemoj koristiti glavni produkcijski ključ bez ograničenja.** Ako aplikaciju namjeravaš ponuditi javnim korisnicima, koristi backend i tajne varijable. Postavi ograničenja i upozorenja za potrošnju na Google računu.

**API model i cijena:** generiranje nije neograničeno ni besplatno. Potrebne su kvote i API pristup za odabrane modele. Google može odbiti zahtjeve zbog sadržaja, regije, kvote, neispravnih parametara ili pristupa računu. Ako preglednik blokira CORS ili upload videa, koristi Node.js backend.

### Lokalna privatnost i galerija

- Fotografije i videi uređeni u lokalnim editorima **ne šalju se na naš server**.
- **Kad koristiš AI**, promptovi i reference namjerno se šalju odabranom AI pružatelju usluge.
- Galerija se čuva u **IndexedDB-u istog preglednika i uređaja**. Nije sinkronizirana s drugim mobitelima/računalima, a brisanje podataka preglednika može obrisati galeriju.
- Redovito preuzimaj važne radove.
- Video izvoz ovisi o `MediaRecorder`, `canvas.captureStream()`, dekoderu i dozvolama preglednika. Izlaz je WebM ili MP4 prema podršci. Zvuk se dodaje kada je audio obrada podržana. Za velike ili profesionalne montaže koristi namjenski desktop editor.

## Struktura projekta

```
aistudio/
├── index.html            # GLAVNA web-stranica (kao na KvizToGo!)
├── editor.html           # uređivanje fotografija
├── video.html            # montaža videa
├── app.js                # funkcije početne stranice, AI i galerija
├── style.css             # dizajn početne stranice
├── tools.css             # dizajn editora
├── cloud.js              # Google Gemini API integracija
├── storage.js            # lokalna galerija IndexedDB
├── photo-editor.js       # Canvas obrada fotografija
├── video-editor.js       # HTML5 obrada videa
├── docs/                 # automatski objavljena identična kopija za Pages
├── scripts/sync-pages.mjs # sinkronizacija root -> docs
├── public/               # ranije Node.js sučelje za backend
├── server.mjs            # Express server za sigurniju API integraciju
├── tests/
└── package.json
```

Sve datoteke urednika napisane su za ovaj projekt i mogu se mijenjati, nadograđivati ili prenositi na drugi hosting. API modeli i sadržaj tih modela ne postaju tvoje vlasništvo samo zato što ih koristiš u aplikaciji.

## Node.js backend (produkcijska opcija)

**Za sigurnije postavljanje s tajnim API ključevima** potreban je Node.js 20+ hosting (Hostinger VPS, Railway, Render...).

```bash
git clone https://github.com/zvonebeslic/aistudio.git
cd aistudio
npm install
cp .env.example .env
# postavi lozinku i jedan ili više API ključeva u .env
npm start
```

Primjer server konfiguracije:
```dotenv
PORT=3000
STUDIO_PASSWORD=stavi-dugu-jedinstvenu-lozinku
GEMINI_API_KEY=tvoj-gemini-api-kljuc
OPENAI_API_KEY=tvoj-openai-api-kljuc
DATA_DIR=./data
NODE_ENV=production
```

Express backend iz mape `public/` koristi API ključeve samo na serveru, sprema medije u `DATA_DIR` i traži Basic prijavu. Za internetski rad obavezni su HTTPS i trajni disk. **GitHub Pages ne može izvršavati Express backend.**

Ovaj projekt trenutačno nije zamjena za profesionalni DaVinci Resolve (višeslojna montaža, color management, audio mixing) niti za kompletnu Higgsfield infrastrukturu (vlastiti GPU klasteri, modeli i video render farma). Sadrži stvarne alate i mogućnost korištenja kompatibilnih vanjskih AI modela.

## Provjere

```bash
npm install
npm run check
npm test
```

Glavni HTML/CSS/JavaScript nalazi se u **korijenu repozitorija**. GitHub Pages trenutačno objavljuje automatski preslikan direktorij `docs/`. Provjere i objave rade preko GitHub Actions.

Za ručno usklađivanje ili provjeru kopije:

```bash
npm run sync:pages
npm run check:pages
```

Za **lokalni pregled bez backenda** otvori projekt pomoću bilo kojeg statičkog HTTP poslužitelja, primjerice `python3 -m http.server 8080`, pa posjeti `http://localhost:8080/`.

## Službena dokumentacija

- Gemini Image: https://ai.google.dev/gemini-api/docs/image-generation
- Gemini Omni: https://ai.google.dev/gemini-api/docs/omni
- Gemini API key security: https://ai.google.dev/gemini-api/docs/api-key
- GitHub Pages: https://docs.github.com/en/pages
