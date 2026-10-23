<p align="center">
  <img src="media/readme/hero.jpg" alt="Sapor: savour the same place. A taste agent that picks one real place for the whole table." width="100%">
</p>

# Sapor

Sapor is a group taste agent. Everyone at the table names a film, show or artist they love, Sapor reads the taste behind those picks with Qloo, finds one real place nearby that suits the whole table, and says what each person should order there, with the evidence for every line.

I built it solo for the [Qloo Agentic Hackathon](https://qloo.devpost.com/) (October 2026). The name is Latin for taste.

Try it at [sapor-nu.vercel.app](https://sapor-nu.vercel.app), or watch the [2:25 demo video](https://youtu.be/5l6xLzkGpoI) (the app, then how it works with Qloo) or the [35 second launch film](media/sapor-launch.mp4).

<p align="center">
  <a href="media/sapor-launch.mp4"><img src="media/readme/demo.gif" alt="Pressing Pick our place: Sapor reads the table, streams its steps and lands on Terra Cafe and Bistro" width="100%"></a>
</p>
<p align="center"><sub>One continuous take of the real app on the sample table.</sub></p>

The idea: popularity lists and star ratings tell you what is busy, not what fits the people you are going with. People are bad at describing food taste in the abstract but good at naming what they love, and Qloo can turn those loves into cuisines and kinds of rooms.

## What you get

1. **Seat the table.** Each person adds up to three loves and can be marked vegetarian. Choose coffee, a meal or dessert, and say where.
2. **One real place** that fits the whole table, with a fairness bar and the practical details from the venue's Qloo record: rating, price range, a labelled estimate for the table, open now, distance, booking, parking and access.
3. **An order for every person**, from that venue's own menu highlights in Qloo, each with a credited photo and, where Qloo's review keywords mention it, how often reviews name it.

## How it decides

<p align="center"><img src="media/readme/how-it-decides.png" alt="Six steps: checks what you meant, reads each person's taste, searches real places, leaves nobody out, orders for each person, gets you there" width="100%"></p>

1. **Resolve each love** to a Qloo entity. If a name is ambiguous (Dune the 2021 film, the book, or the German techno group), the agent stops and asks, because each draws a different crowd.
2. **Read each person's taste.** One Qloo call per person returns the cuisines and kinds of rooms people who share those loves tend to favour.
3. **Search real places nearby**, with everyone's loves and the table's shared tags as signals.
4. **Guard and widen.** Permanently closed venues and venues with no cuisine or menu data (the cafe filter sometimes returns gyms) are set aside. If too few remain, the search widens and the app says so.
5. **Score every venue for every person** against the venue's own Qloo tags, blended with Qloo's per-signal explainability, then rank weakest person first.
6. **Write each order** from the menu highlights. Vegetarian rules are strict, a dessert outing prefers desserts, nobody is defaulted to alcohol, and a dish that isn't a taste match is labelled "house favourite". The dish-to-cuisine link is my own keyword map, not Qloo data, and a dish two people share is labelled as such.
7. **Explain.** One short line per person, written by Groq (`gpt-oss-120b`) with Cerebras and Gemini Flash-Lite as fallbacks. A validator rejects lines that address the reader, praise the food, or leak a seat letter, and a template is used instead.

### The ranking

```
table score = 0.60 × weakest person's match + 0.25 × average match + 0.15 × Qloo affinity for the venue
```

- A **match** (0 to 1) is how much of one person's Qloo taste profile the venue's own Qloo tags carry, nudged up when a dish fits them and down when none does. It is not a probability that they will enjoy it.
- **Qloo affinity** (0 to 1) is Qloo's own score for the venue given the whole table's signals. Among nearby candidates it sits in a narrow band, so at 15% it only settles near ties and cannot outweigh a 25 point gap in the weakest match.
- Ties go to the better weakest match, then the better average, then the name.

Why not Qloo's affinity alone? An earlier version let a venue Qloo loved win even when one guest matched it at 35%. That counterexample, the live case it broke, and a strict maximin baseline are all in [`tests/score.test.ts`](tests/score.test.ts).

### Qloo calls

| Step | Endpoint | Parameters that matter |
| :-- | :-- | :-- |
| Resolve a love | `GET /search` | `query`, `types` = artist, movie, tv_show, book, podcast, videogame |
| Taste profile | `GET /v2/insights` | `filter.type=urn:tag`, `signal.interests.entities`, `filter.tag.types=urn:tag:cuisine:qloo,urn:tag:ambience:qloo` |
| Venue search | `GET /v2/insights` | `filter.type=urn:entity:place`, `signal.interests.entities`, `signal.interests.tags`, `filter.tags`, `filter.location.query`, `feature.explainability=true` |

A full plan costs about one Qloo call per person plus one venue search, and repeats come from a six-hour cache.

On the sample table (three people in Jubilee Hills, Hyderabad, out for coffee) Terra Cafe & Bistro wins at 0.85, with a weakest match of 83%. Roast CCX comes second at 0.78: its weakest match is 74% despite a higher Qloo affinity.

Names typed in the app never leave the browser. The server sees seats as A, B, C, and Qloo only receives entity ids, tag ids and a place name. Your location, if you share it, is only used in the browser to measure distance.

## Run it

Needs Node.js 22.19 or newer and a Qloo hackathon key.

```sh
git clone https://github.com/victorisaacchinta-eng/sapor.git
cd sapor
npm install
cp .env.example .env.local   # then put your keys in .env.local
npm run dev                  # http://localhost:3000
npm test                     # ranking, dishes and price parsing, no keys needed
```

| Variable | Needed? | What it does |
| :-- | :-- | :-- |
| `QLOO_API_KEY` | Required | Every taste and venue lookup |
| `UNSPLASH_ACCESS_KEY` | Recommended | Real dish photos; without it dishes are shown by name |
| `PEXELS_API_KEY` | Optional | Dish photos from Pexels, used if only this key is set |
| `GROQ_API_KEY` | Optional | Writes the one-line explanations (`gpt-oss-120b`) |
| `CEREBRAS_API_KEY` | Optional | First fallback writer (`gpt-oss-120b`) |
| `GEMINI_API_KEY` | Optional | Second fallback writer (`gemini-flash-lite-latest`) |

Without a language key, Sapor still parses "Name: thing, thing" input with simple rules and writes its explanations from templates. Every Qloo call happens in server routes (`src/app/api/*`), so keys stay on the server. To deploy, import the repo into Vercel and add the same variables.

22 unit tests cover the fairness counterexample and maximin baseline, the live ranking regression, vegetarian and alcohol rules on real menu names, shared dishes, and open-ended prices.

Most of the logic is in `src/lib` (`agent.ts` for the loop, `score.ts` for the ranking, `qloo.ts` for the client). The interface is `src/components/Sapor.tsx`.

## Limitations

- **Qloo describes groups, not people.** An affinity says what people who love BTS tend to like. It is not a prediction about your friend, and the app words it that way.
- **No dish prices or dish ratings**, only the venue's price range and rating. The range doesn't say whether it is per person, so the table figure is labelled as an estimate.
- **Qloo's own venue order is flat.** It changes less between very different tastes than you might expect. The re-ranking on each venue's tags is what makes picks differ, and it is my method, not a Qloo score.
- **Dish matching and vegetarian checks are keyword based.** Unusual dish names can be missed. Dishes usually made with meat (bao, momos, ramen, burgers) only count as vegetarian when the name says so.
- **Dish photos are stock, not the venue's own.** Each is a credited photo of the named dish (or of its key ingredient, labelled "a close match"). Venue and diner photos belong to them or to the platforms they were posted on (Zomato and Swiggy terms bar copying them), so Sapor links to the venue's Google Maps page and an image search instead.
- **Menu highlights are not a live menu.** Check on arrival.
- **Distance is a straight line.** Tap Directions for real travel time.
- **Coverage varies by city.** Menu highlights are rich in Hyderabad, Bengaluru and Brooklyn, thinner in some neighbourhoods and smaller towns.
- **Some cafe results are not cafes.** In Shoreditch the cafe filter returned Sky Garden. A place with a cafe inside can still get through the guard.
- **Match scores are not calibrated against real people yet.** They are comparable within a table, but nobody has rated real outings against them.

## Credits

Taste data, venue details and entity images: [Qloo](https://www.qloo.com/) Taste AI. Food photos: [Unsplash](https://unsplash.com/?utm_source=sapor&utm_medium=referral) photographers, credited on each photo (the banner uses dishes by Paul, Pavan Reddy and Kalyani Akella). Type: Clash Display and Satoshi by Indian Type Foundry, via Fontshare. Shapes, mosaic and launch film: original, made in code for Sapor. Narration voice: Gemini TTS via Google AI Studio. Music: Google Flow Music.

MIT licensed. Built by Victor Isaac for the Qloo Agentic Hackathon, October 2026.
