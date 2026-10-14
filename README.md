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

Alle data staat in `localStorage` van de browser. Bij de eerste start wordt demo-data geladen; die kun je
wissen via *Team & capaciteit → Demo-data wissen*.

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
- `src/views/` — de vier hoofdschermen.
- `src/components/` — sidebar, header, zijpaneel, modals en gedeelde UI-elementen.
