# Menu builder — plan

Replace the Word file (`INDIA GATE RESTAURANT ISTANBUL 2026.docx`) with something
the app owns, so the menu you send agencies is generated rather than maintained
by hand — and so the prices in it are the same prices the books use.

**Nothing here is built yet.** This is the shape agreed before writing code.

---

## 1. What exists today

**The Word document** — 5 pages:

| Page | Contents |
| --- | --- |
| 1 | Logo, then Veg Menu 1 ($15), Veg Menu 2 ($16), Veg Menu 3 ($18) |
| 2 | Jain ($16), Non-Veg 1 ($17), Non-Veg 2 ($19) |
| 3 | Non-Veg 3 ($21), Special Lamb ($26), Special Fish ($26) |
| 4 | Catering 1 and 2 (both $27 + $2 catering charge) |
| 5 | Terms and Conditions, two contacts, address, logo |

Every menu is the same block: restaurant name, menu name, price marked `+KDV`,
then an unnumbered list of dishes. There are no per-dish prices and no
descriptions — the descriptions are what you want to add.

**The app** — much less than you might expect:

- `GroupMenu` is **only** `name` and `is_active`. No price, no dishes.
- `group_sale_lines` stores `menu_name_snapshot` and `rate_per_person_minor`,
  so a sale already keeps its own copy of the name and price. Changing a menu
  later will not rewrite history. That part is already right.
- `entities` holds `name`, `legal_name`, `vkn` — **no logo, address, phone or
  email**. The branding on the document has nowhere to live yet.
- There is a storage adapter (local and R2) used for receipts and invoices, so
  a logo upload has somewhere to go.
- `reports/pdf_export.py` has the shared statement furniture, but **no image
  support** — placing a logo is new work.

---

### What the 2023 file adds

The `2023.docx` is the same document three years earlier, and comparing them
settles several design questions.

**The structure is unchanged.** Same dishes, same order, same "OR SIMILAR"
convention. What changed between 2023 and 2026:

| Menu | 2023 | 2026 |
| --- | --- | --- |
| Veg 1 / 2 / 3 | $12 / $13 / $14 | $15 / $16 / $18 |
| Jain | $14 | $16 |
| Non-Veg 1 / 2 / 3 | $14 / $15 / $16 | $17 / $19 / $21 |
| Special Lamb / Fish | $18 / $18 | $26 / $26 |
| Catering 1 / 2 | — | $27 + $2, new in 2026 |

So a year's revision is **a price change and the occasional new menu**, not a
rewrite. That means editing menus in place each January rather than cloning a
whole document — and it is why no price-history table is needed (§3): the sale
already keeps its own copy of the price.

**The file is named ISTANBUL. Every table inside says CAPPADOCIA.** Nine table
headers, all with the wrong city — copied from the Cappadocia menu and never
updated. That is precisely the failure the plan removes: the restaurant name
would come from the entity record and be printed once, not typed into nine
places where eight can silently disagree with the tenth.

**The Jain menu lists WHITE RICE twice in 2023 as well as 2026.** That error
has survived three years and a full re-pricing. It is not carelessness — it is
a list of nine near-identical blocks in a Word table, which is a format that
hides duplicates. A dish list makes it impossible.

**Practical note:** `.docx` tables are machine-readable — I read all nine menus
out of this file exactly. The 2026 file exists only as a PDF with no text
layer, so I read that one from rendered images. See §8 for how seeding works
without it, and what needs checking by eye.

---

## 2. Decisions taken

| Question | Decision |
| --- | --- |
| What does the page produce? | The PDF you send agencies. The app becomes the source; the Word file is retired. |
| Menu price on a group sale? | Pre-fills the rate, still editable. |
| How are dishes stored? | A reusable dish list. Menus reference dishes. |
| How many restaurants? | More than the app knows. **You will add them yourself, when you want to** — not a dependency (§8). |
| Do locations share menus? | **No. Everything per restaurant.** See §2a. |
| What format goes to agencies? | **PDF only.** Never `.docx` or `.xlsx` — see §5. |
| Logo | Uploaded per restaurant. |

The dish list matters more than it sounds. **Dal Tadka, White Rice, Tandoori
Naan, Dessert, Water, Raita and Fresh Salad appear in nearly every one of the
11 menus.** Typed separately they are eleven places to edit, which is exactly
how the current document drifted (§7).

---

## 2a. One menu set per restaurant

**Decided: everything is per restaurant.** Dishes, menus and prices all carry
an `entity_id`, exactly like the rest of the app.

The reason is the one you gave: they are different companies with different
VKNs. Sharing would have meant a scoping tier above the restaurant, and the
app enforces per-restaurant isolation seriously — `EntityScopedMixin` on every
model, and tests asserting **every** entity-scoped table has row-level security
enabled with a policy, and that the RLS table list and the model list agree
exactly. That is the wall keeping India Gate's books away from Spice Corner.
Sharing dishes would have meant a deliberate hole in it, for the sake of
spelling *dessert* once instead of three times.

The cost of this choice, stated plainly: **each restaurant needs its own dish
list built once**, and a correction is one edit per restaurant. You said you
would rather do that work once, and the trade is a good one — the isolation
model stays whole, and no restaurant can ever alter another's menu.

Nothing about the screens changes; §4 and the mockups stand as shown.

Each restaurant added later is a full tenant — its own books, chart of
accounts, memberships and access — and gets its own menus when you build them.
Nothing in this plan waits for that; see §8.

---

## 3. Data model

Everything below is entity-scoped — `EntityScopedMixin` and an RLS policy, like
every other business table. No new scoping concepts.

### `dishes` — new

**Built.** As shipped:

| Field | Notes |
| --- | --- |
| `name` | "Dal Tadka". Unique per restaurant — two rows with one name means the wrong one gets picked. |
| `description` | English, for agencies. Optional; a dish with none prints as its name alone. |
| `description_tr` | Turkish. Only the description is translated; names are not. |
| `suits_veg`, `suits_non_veg`, `suits_jain` | Three flags, all true by default. |
| `is_active` | Retired dishes stay, so old menus still read correctly. |

**Three flags, not one classification.** The first version had a single
`dietary` value and it was wrong within an hour of use: Dal Tadka belongs on
the veg, non-veg *and* Jain menus, and the current Non-Veg Menu 1 opens with
it. One value could not say that. Defaulting all three to true means rice,
naan, salad and water need no ticking at all — you untick where a dish does
not belong, which is really just meat off the veg and Jain menus.

### `group_menus` — extend the existing table

Extending rather than replacing, because `group_sales.group_menu_id` already
points at it and `menu_name_snapshot` already keeps history safe.

| New field | Notes |
| --- | --- |
| `description` | Optional blurb under the menu name. |
| `price_minor` + `currency` | The list price. USD today. |
| `surcharge_minor` + `surcharge_label` | For "+$2 catering charges" — the catering menus have one, the rest do not. |
| `price_excludes_vat` | Renders the `+KDV` note. The terms say 10%. |
| `category` | Veg / Jain / Non-Veg / Special / Catering — the grouping in the document. |
| `sort_order` | So the PDF comes out in your order, not alphabetically. |

**The price sits on the menu, and there is no price-history table.** I proposed
one earlier and it no longer earns its place. The reason it looked necessary
was sharing — Istanbul and Cappadocia needing different prices for one menu.
With a menu set per restaurant that dimension disappears, and the other
argument for history was old bookings, which is already covered:
`group_sale_lines.rate_per_person_minor` snapshots the price at the moment of
sale. Raising a price next January cannot disturb a sale already recorded.

If you later want to reprint last year's document, that is when to add history
— not before.

### `group_menu_lines` — new

One row per line of a menu, ordered.

| Field | Notes |
| --- | --- |
| `group_menu_id`, `dish_id` | The reference. |
| `sort_order` | Rice, naan and dessert come last for a reason. |
| `note` | "or similar", "1 litre for 4 pax". |

The `note` is what keeps the dish list usable. Your document says **"OR
SIMILAR"** on a dozen lines. Without a note, either the dish is named "Mix Veg
Curry or similar" — useless on any other menu — or the meaning is lost. One
column, and it is not a rename.

### `entities` — branding

Add to the restaurant record: `logo_file_id`, `address`, `phone_primary`,
`phone_secondary`, `email`, plus `menu_terms` and `menu_validity_note`
("valid until the end of 2026").

The logo belongs here rather than anywhere higher up: each restaurant uploads
its own, and each prints its own name from its own record. That is the
Cappadocia mistake made structurally impossible.

---

## 4. Screens

Following the existing archetypes; no new page shapes.

**`/menu` — hub, three tabs**

1. **Menus** (`ListPage`) — name, category, price, dish count, active. This is
   where you add and remove menus.
2. **Dishes** (`ListPage`) — name, dietary, description, how many menus use it.
   The usage count is the safety net: it tells you what you are about to
   change before you change it.
3. **Document** (`FormPage`) — logo upload, address, contacts, terms, validity.

**Menu detail** (`EntityDetailPage`) — the price and category at the top, then
the dish lines: add from the dish list, reorder, remove, set a note. This is
the screen you will actually live in.

The current `/customers/group-menus` page is a 5-line wrapper around
`GroupMenusPanel`. It becomes a link to the new hub rather than a second place
to edit menus.

---

## 5. The PDF — and only the PDF

A new `menu_pdf.py`. It shares the page setup with the existing statement
exports but **not** the masthead — that one is branded for Mizan, and this
document is branded for the restaurant.

- Logo at the top and bottom, from the uploaded file. Needs reportlab's `Image`
  flowable, which the current exporter does not use.
- One block per menu, grouped by category, in `sort_order`.
- Price line: `VEG MENU 1    $15 +KDV`, with the surcharge appended where there
  is one.
- Descriptions print under each dish when present, so adding them later does
  not require a new layout.
- Terms, contacts and address on the last page, from the restaurant record.

### No Word, no Excel

**The download offers PDF alone.** Every other download in the app gives you a
choice of Excel or PDF; this one deliberately does not.

The reason is yours and it is a good one: an agency that receives a `.docx` can
change a price and send it on, and nothing about the file says it was altered.
A spreadsheet is worse — the numbers are already in cells waiting to be edited.

**One honest limit.** A PDF is not tamper-proof. Anyone determined can edit
one, and reportlab's permission flags are advisory — most readers respect them,
none enforce them. What a PDF does is refuse to *invite* editing, which is the
realistic threat: not a forger, but a tour operator who nudges a figure and
forwards it. If a price is ever disputed, the record that settles it is the
group sale in the books, not the document.

That also means the shared `SubledgerDownloadMenu` is the wrong component here
— it is built for a two-format choice. This wants a plain Download button.

---

## 6. Link to group sales

Choosing a menu on a group sale fills the per-person rate from the menu price,
still editable.

**The currency edge is worth stating now.** Menu prices are USD; a group sale
can be in TRY. Pre-filling only makes sense when the sale is in the menu's
currency — otherwise it would need a rate, and inventing one silently is how
the FX bugs earlier this month happened. So: pre-fill when the currencies
match, leave blank and say why when they do not.

Because `rate_per_person_minor` is already snapshotted on the sale line,
raising a price next year does not disturb any sale already recorded.

---

## 7. Errors in the current document

Found while reading it — all of the kind a shared dish list prevents:

- **"DESERT"** throughout, in both 2023 and 2026. A desert is sand; you mean
  **dessert**.
- **"DESERT (SWEAT)"** on both catering menus. Sweat is perspiration; you mean
  **(sweet)**. Worth fixing before the next agency sees it.
- **The Jain menu lists WHITE RICE twice** — in 2023 *and* 2026. Three years.
- **The 2023 file says CAPPADOCIA in all nine headers** while being named
  Istanbul.
- "MENU– NON VEG" on the special menus has no space after the dash.

Every one is a copy-paste artefact, and every one is prevented by the design
above: the spelling lives in one dish record, the city comes from the entity,
and a menu cannot list the same dish twice without it being obvious.

They are also the argument for doing this at all. The menu is not a big
document, but it is a document that has been wrong in the same way for three
years, and it goes to customers.

---

## 8. Build order

Each slice is useful on its own and leaves the app working.

| # | Slice | Why this order |
| --- | --- | --- |
| 0 | *(yours)* Add the missing restaurants, when you are ready | Not blocking — see below. |
| 1 | Dishes: model, list, form | Nothing can reference dishes until they exist. Small, self-contained. |
| 2 | Menu content: price, category, lines, detail screen | The heart of it. After this the data is real, even without a PDF. |
| 3 | Restaurant branding: logo upload, address, contacts, terms | Needed only by the PDF, so it waits until the content is right. |
| 4 | The PDF | Once the content is settled, the document is layout work. |
| 5 | Group sale pre-fill | Last: depends on prices existing, and is the only piece that touches the books. |

Choosing A removed the brand tier, the per-restaurant price table and the RLS
exemption — roughly a third of the work, and the third with the most risk in it.

### Locations are not a dependency

You will add the other restaurants yourself, in the app, when you want them.
Nothing here waits for that. Slices 1–5 are built once and work for whichever
restaurants exist; a location added in March simply gets its menus built then.
The only thing that scales with locations is the data entry, and that is
front-loaded per restaurant rather than blocking the build.

### Seeding, without the 2026 file

There is no `.docx` for 2026 — only the image PDF. So the seed comes from two
sources:

- **The 2023 `.docx`**, which gives *exact* spellings for every recurring dish:
  Dal Tadka, Mix Veg Curry, White Rice, Tandoori Naan, Water (1 litre for 4
  pax), Raita, Fresh Salad, Jain Dal, Butter Chicken, Chicken Kadai, Lamb
  Kadai, Fish Masala and the rest. The 2026 menus reuse nearly all of them.
- **My reading of the 2026 PDF** for the prices, the menu names that gained
  numbers, and what is genuinely new.

Everything in the first group is certain. **What needs your eye is the short
list that appears only in 2026:**

| Only in 2026 | Where |
| --- | --- |
| Catering Menu 1 and 2 — the whole blocks | new for 2026 |
| Soup (veg or non-veg) | catering |
| Veg Starter, Non-Veg Starter | catering |
| Rajma Masala or similar | catering |
| "Desert (Sweat)" | catering — and the line to fix first |
| The `$27 + $2 catering charges` price shape | catering |
| Prices on all 9 returning menus | $15/$16/$18, $16, $17/$19/$21, $26/$26 |

That is a page to check, not a document to re-type. And once slice 2 is in,
correcting anything I misread is a text field — not a Word table.

---

## 9. Open questions

All settled.

| Question | Answer |
| --- | --- |
| Descriptions in the PDF? | **Printed.** They are written for agencies. |
| Turkish? | **Descriptions yes, names no.** "Dal Tadka" is what it is called in any language. |
| Locations | Yours to add, not a dependency (§8). |
| The 2026 `.docx` | Does not exist. Seeding works as described in §8. |
| Does every restaurant get this? | The **feature** yes — every restaurant has the pages. The **dishes** are its own, per §2a. |

### "Global" — feature, not data

Worth stating plainly because it is easy to read the other way. Every
restaurant added later gets the Dishes page, its own menus and its own PDF.
What it does *not* get is India Gate Istanbul's dish list: that is the
separation chosen in §2a, for the reason given there — separate companies,
separate VKNs, and an isolation model worth keeping whole.

The practical cost is typing the list once per restaurant. If that becomes
tiresome, the answer is **a "copy dishes from another restaurant" button** at
setup — one click, then the two diverge and neither can alter the other. That
is a slice-2 convenience, not an architectural change, and it stays available
whenever it is wanted.

### Descriptions can be drafted

Since descriptions go to agencies and there are a lot of dishes, the form has
a **Draft for me** button: it writes an English and a Turkish sentence from
the dish name and puts them in the boxes.

It fills the form and saves nothing. What comes back is a starting point from
something that has never eaten in the kitchen — the "or similar" on a dozen
of these lines exists because the dish varies by day. It also declines to
overwrite a description already written by hand.
