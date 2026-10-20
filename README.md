# Sapor

**A taste agent for your table.** Everyone names a film, show or artist they love. Sapor reads the taste behind those picks with Qloo, finds a real place nearby that suits the whole group, and writes what each person should order there, with the evidence for every line.

*Sapor* is Latin for taste.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/), October 2026.

---

## The problem

"Where should we go?" is the most-asked, worst-answered question in any group chat. The usual answers are popularity lists and star ratings, which tell you what is busy, not what fits *these* people. The loudest person picks, and someone sits through a meal that was never for them.

People are bad at describing their food taste in the abstract, but they are very good at naming the things they love. Qloo's taste graph connects those two: what a film or artist's audience tends to like in cuisines, rooms and places.

## What Sapor does

1. **Checks what you meant.** Each love is resolved to a Qloo entity. If a name is genuinely ambiguous (Dune the 2021 film, the book, or the German techno group), the agent stops and asks instead of guessing, because each draws a different crowd.
2. **Reads each person's taste.** One Qloo call per person returns the cuisines and kinds of rooms people who share those loves tend to favour.
3. **Searches real places nearby.** One Qloo call finds venues in the neighbourhood you typed, with everyone's loves (and the table's shared tags) as signals.
4. **Guards and widens.** Venues with no cuisine or menu data in Qloo are set aside (Qloo's cafe filter sometimes returns gyms and hotels). If too few remain, the search widens step by step, and the app says so.
5. **Makes sure nobody is left out.** Every venue is scored for every person against the venue's own Qloo tags, blended with Qloo's per-signal explainability. The table score weighs the *lowest* person's fit as much as the average.
6. **Writes each order.** Sapor maps the venue's Qloo menu highlights to each person's cuisines, respects vegetarians strictly, prefers desserts for a dessert outing, never defaults anyone to alcohol, and labels a dish "house favourite" when it is not a taste match.
7. **Explains itself.** One short line per person, written by a small language model that may only use the evidence it is given, with a template fallback.

### Why this needs Qloo

Without Qloo this app has nothing to reason with. The two things it cannot get anywhere else:

- **Cross-domain taste.** Measured on 21 Oct 2026 with live calls: fans of BTS and Squid Game lean Korean, Thai, Chinese and Japanese and like hip, funky rooms; fans of A. R. Rahman and The Grand Budapest Hotel lean Indian and like tranquil, serene rooms; fans of Prateek Kuhad and Before Sunrise lean global and contemporary.
- **Venue tags at dish level.** Real venues come back with cuisine, ambience, decor and menu-highlight tags, so a K-pop fan at Terra Cafe & Bistro in Jubilee Hills gets the Korean chicken bao, and a vegetarian at the same table gets the pav bhaji bruschetta.

## Qloo workflows used

| Step | Qloo endpoint | Parameters that matter | Why |
| --- | --- | --- | --- |
| Resolve a love | `GET /search` | `query`, `types` = artist, movie, tv_show, book, podcast, videogame | Turns free text into an entity id, with alternatives for ambiguity checks |
| Taste profile | `GET /v2/insights` | `filter.type=urn:tag`, `signal.interests.entities`, `filter.tag.types=urn:tag:cuisine:qloo,urn:tag:ambience:qloo` | What each person's crowd favours in food and rooms |
| Venue search | `GET /v2/insights` | `filter.type=urn:entity:place`, `signal.interests.entities`, `signal.interests.tags`, `filter.tags` (venue type), `filter.location.query`, `feature.explainability=true` | Real nearby venues, their tags, and how much each person's signals contributed |

A full group plan costs about one Qloo call per person plus one venue search, and repeats are served from a six-hour cache.

## A request, start to finish (redacted)

Table: three people in Jubilee Hills, Hyderabad, out for coffee. The second person is vegetarian.

1. `/search?query=BTS` resolves to *BTS* (artist). `/search?query=Dune` returns a film, a book and an artist with near-identical popularity, so the UI asks.
2. Taste profile for person A (BTS, Squid Game): cuisines Korean 0.87, Thai 0.86, Chinese 0.81; rooms Hip 0.91.
3. Venue search: cafes in "Jubilee Hills, Hyderabad", signals = all six entities plus the table's top shared tags (Indian, Serene, Tranquil). 30 venues back; 2 set aside with no food data.
4. Scoring: Terra Cafe & Bistro matches A on Korean, Thai, Japanese; B on Comfortable, Italian, Welcoming and is tagged vegetarian-friendly; C on Comfortable, Italian, Intimate. Lowest fit 83%, average 94%.
5. Orders from Terra's menu highlights: A, Korean chicken bao (Korean); B, Pav bhaji bruschetta (Indian, vegetarian); C, Paneer Korean bao (Indian).

Names typed in the app never leave the browser. The server sees seats as A, B, C, and Qloo only ever receives entity ids, tag ids and a place name.

## Run it yourself

Requirements: Node.js 22.19 or newer, a Qloo hackathon key.

```sh
git clone https://github.com/victorisaacchinta-eng/sapor.git
cd sapor
npm install
cp .env.example .env.local      # then put your key in .env.local
npm run dev                      # http://localhost:3000
```

`QLOO_API_KEY` is the only required value. The language layer is optional: set any one of `GROQ_API_KEY`, `CEREBRAS_API_KEY` or `GEMINI_API_KEY` (all have free tiers). Without one, Sapor still parses "Name: thing, thing" input with simple rules and writes its explanations from templates.

To deploy, import the repo into Vercel and add the same environment variables. Every Qloo call happens in server routes (`src/app/api/*`); the key never reaches the browser.

## Project layout

```
src/lib/qloo.ts      server-only Qloo client: timeout, one bounded retry, LRU cache
src/lib/agent.ts     resolution, taste profiles, venue search, guardrails, fairness scoring
src/lib/dishes.ts    Sapor's dish-to-cuisine map, vegetarian, dessert and alcohol rules
src/lib/llm.ts       optional language layer with a free-provider fallback chain
src/app/api/         resolve, plan (streams the agent's steps), parse
src/components/      the interface
```

## Known limitations

- **Qloo describes groups, not people.** An affinity says what people who love BTS *tend to* like. It is not a prediction about your friend, and the app words it that way.
- **Direct venue ranking is flat.** Qloo's own venue order changes less between very different tastes than you might expect (top-10 overlap of 50 to 80% across our test personas). Sapor's re-ranking on each venue's tags is what makes picks differ; it is our method, not a Qloo score.
- **Dish matching is ours.** Qloo tags venues with menu highlights and people with cuisines, but does not link a dish to a cuisine. `dishes.ts` does that with a small keyword map, and it will miss dishes with unusual names. The UI says "house favourite" whenever no match is found.
- **Vegetarian is keyword based.** Anything that might contain meat or egg is treated as non-veg, which is cautious but not a guarantee. Check with the venue.
- **Coverage varies by city.** In our tests (21 Oct 2026) menu highlights were specific and rich in Hyderabad, Bengaluru and Brooklyn. In Shoreditch, London the top picks were food halls and arcades with generic highlights ("Indian dishes"), some outside the neighbourhood typed. Smaller towns may return few venues with menu data.
- **Freshness.** Qloo's venue data may lag real openings and closures.

## Credits

Taste data: [Qloo](https://www.qloo.com/) Taste AI. Type: Fraunces (Undercase Type, SIL OFL) and Switzer (Indian Type Foundry, Fontshare licence).

MIT licensed. Built by Victor Isaac.
