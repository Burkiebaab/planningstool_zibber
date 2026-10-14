# Zibber Marketingplanning

Planningstool voor het marketingteam van Zibber: intake-aanvragen uit Jira en handmatige taken
inplannen per teamlid en week, met zicht op capaciteit, deadlines en overboekingen.

## Schermen

- **Intake-inbox**: alles wat nog (deels) ingepland moet worden, gesorteerd op prioriteit, deadline of aanmaakdatum.
- **Weekplanning**: sleep items uit de inbox naar een teamlid en week. Per cel zie je gepland vs. beschikbaar (ruimte / vol / overboekt), inclusief vrije dagen en terugkerende taken.
- **Kwartaaloverzicht**: projecten en werkzaamheden op een tijdlijn met deadlines.
- **Team & capaciteit**: teamleden, werkdagen, vakanties, bezetting voor 8 weken en terugkerende taken.

Verder: zijpaneel per item (planning verdelen over weken, Jira-velden), waarschuwingen
(geen inschatting, na deadline, overboekt, gesloten in Jira), filters en zoeken, CSV-export van de planning
en een Jira-koppeling (gesimuleerd in de demo, of via import van een Jira CSV-export; matching op Issue key).

## Opslag en inloggen

Met Supabase gekoppeld staat de planning centraal in een database en ziet iedereen dezelfde planning;
wijzigingen van collega's komen direct (realtime) binnen. Inloggen gaat via Google en alleen
@zibber.nl-accounts hebben toegang. Dat wordt afgedwongen in de app én in de database (Row Level Security).

Zonder Supabase-gegevens draait de app volledig lokaal: alles staat dan in `localStorage` van de browser,
zonder inlog. Handig voor ontwikkelen.

### Supabase instellen

1. Voer [`supabase/schema.sql`](supabase/schema.sql) uit in Supabase → **SQL Editor**. Het script kan veilig opnieuw worden uitgevoerd.
2. Activeer bij **Authentication → Hooks → Before User Created** de Postgres-functie `public.hook_alleen_zibber`
   (weigert aanmeldingen van buiten @zibber.nl).
3. Zet bij **Authentication → Providers** Google aan en *Email* uit.
4. Zet bij **Authentication → URL Configuration** de Site URL op het productie-adres en voeg `https://*.vercel.app/**` toe aan de Redirect URLs.
5. Zet in Vercel (Production en Preview) de omgevingsvariabelen:
   - `VITE_SUPABASE_URL` – de Project URL
   - `VITE_SUPABASE_ANON_KEY` – de publishable/anon key

### Jira koppelen

De Vercel-functie [`api/jira-sync.ts`](api/jira-sync.ts) haalt tickets op uit Jira. De Jira-sleutel staat alleen op de
server; alleen ingelogde @zibber.nl-gebruikers kunnen de functie aanroepen. Zet in Vercel (Production en Preview):

- `JIRA_SITE` – bijv. `zien24.atlassian.net`
- `JIRA_EMAIL` – e-mailadres van het Jira-account voor de koppeling
- `JIRA_API_TOKEN` – API-token van dat account (id.atlassian.com → Security → API tokens)

Welke tickets binnenkomen bepaalt de JQL in de app (Instellingen), standaard
`project = MKT AND statusCategory != Done ORDER BY created DESC`. De app haalt op bij openen, elke paar minuten zolang
iemand de app open heeft en via "Nu ophalen". Tickets die al in de planning staan maar niet meer in de resultaten
voorkomen, worden los gecontroleerd zodat afgeronde of verwijderde tickets als gesloten worden gemarkeerd.
Zonder deze variabelen valt de app terug op de gesimuleerde demo-koppeling of CSV-import.

**Uren-inschatting:** de tool is leidend. Een schatting uit Jira (*Original estimate*) wordt overgenomen zolang de
uren in de tool niet zijn aangepast. Pas je de uren in de tool aan, dan blijft die waarde staan en wordt de
*Original estimate* in Jira automatisch bijgewerkt. Daarvoor moet het Jira-account tickets mogen bewerken en moet
*Original estimate* (tijdregistratie) op het ticketscherm staan.

**Omzetten naar Jira-ticket:** een handmatige taak kan via het zijpaneel (na bevestiging) als ticket in Jira worden
aangemaakt, in project `JIRA_PROJECT` (standaard `MKT`). Titel, notitie, aanvrager, deadline, uren, prioriteit en
markt/kanaal (als labels) gaan mee; velden die niet op het aanmaakscherm van Jira staan worden overgeslagen en gemeld.
De taak wordt daarna het Jira-ticket; de planning blijft staan.

Bij de eerste keer inloggen is de database leeg; de app vraagt dan of je de gegevens uit je browser wilt overnemen,
met demo-data wilt starten of leeg wilt beginnen.

## Ontwikkelen

```bash
npm install
npm run dev        # ontwikkelserver
npm run build      # typecheck + productiebuild in dist/
npm run preview    # productiebuild lokaal bekijken
```

Het oorspronkelijke ontwerp staat in [`design/`](design/) (open `Zibber Marketingplanning.dc.html` in een browser).

## Structuur

- `src/lib/` — datamodel, planningslogica (capaciteit, inbox, waarschuwingen), Jira-merge/CSV-import, opslag en acties (`store.ts`).
  `remote.ts` en `remoteSync.ts` regelen opslaan in en realtime bijwerken vanuit Supabase.
- `src/Root.tsx` — inloggen, laden en de eerste-keer-keuze; daarna de app.
- `supabase/schema.sql` — tabellen, beveiliging en realtime voor Supabase.
- `src/views/` — de vier hoofdschermen.
- `src/components/` — sidebar, header, zijpaneel, modals en gedeelde UI-elementen.
