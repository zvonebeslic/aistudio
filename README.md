# ✦ Zvone AI Studio

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
├── docs/                 # GitHub Pages web aplikacija
│   ├── index.html        # AI generiranje, galerija, postavke
│   ├── app.js            # radni prostor i prikaz
│   ├── cloud.js          # Gemini API, osobni ključ za sesiju
│   ├── storage.js        # IndexedDB lokalna galerija
│   ├── editor.html       # izvorni foto editor
│   ├── photo-editor.js   # Canvas 2D obrada fotografije
│   ├── video.html        # izvorni video editor
│   ├── video-editor.js   # trim, efekti i MediaRecorder izvoz
│   ├── style.css
│   └── tools.css
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

Kod i HTML/CSS/JS za Pages objavljuju se iz direktorija `docs/`. Repozitorij koristi automatizirane provjere kroz GitHub Actions.

## Službena dokumentacija

- Gemini Image: https://ai.google.dev/gemini-api/docs/image-generation
- Gemini Omni: https://ai.google.dev/gemini-api/docs/omni
- Gemini API key security: https://ai.google.dev/gemini-api/docs/api-key
- GitHub Pages: https://docs.github.com/en/pages
