---
marp: true
theme: overture
paginate: true
title: Overture Schema Workshop
description: Model your own data with the Overture schema framework — CNG Forum 2026
---

<!-- _class: title -->
<!-- _paginate: false -->

# Model your data with Overture's schema

Overture Schema Workshop · CNG Forum 2026 · Snowbird

---

## Today

1. **Why** write a schema as code
2. **How**: a model, its fields, its constraints
3. Turn it into a **package**, then into **docs, validation and catalog columns**
4. Faster starts: **tools** and **agents**

```console
pip install overture-schema overture-schema-codegen   # Python 3.10+
```

<!--
Codespaces run Python 3.12. Everything in this deck was run against the 2.0.0
packages on PyPI.
-->

---

<!-- _class: divider -->

# Why

---

## One model, many outputs

The model is the **source of truth**. Everything else is generated from it.

```text
                    ┌──▶  Markdown reference docs
                    ├──▶  JSON Schema
   models.py  ──────┼──▶  Validation (Python, CLI)
                    ├──▶  PySpark checks for Parquet at scale
                    └──▶  STAC table:columns  (coming)
```

Types, **constraints**, and **commentary** live in one place, so they cannot drift apart.

---

## A real Overture model

```python
Depth = NewType("Depth", Annotated[int32, Field(
    ge=0, description="Depth below surface level of the feature in meters.")])

class Bathymetry(OvertureFeature[Literal["base"], Literal["bathymetry"]]):
    """
    Bathymetry features provide topographic representations of underwater
    areas, such as parts of lake beds or ocean floors.
    """
    geometry: Annotated[
        Geometry,
        GeometryTypeConstraint(GeometryType.POLYGON, GeometryType.MULTI_POLYGON),
        Field(description="Shape of the underwater area."),
    ]
    depth: Depth
```

<!--
Condensed from packages/overture-schema-theme-base/src/overture/schema/base/bathymetry.py.
Point out: the docstring, the geometry restriction, and a constraint (ge=0) riding on a named type.
-->

---

## …becomes documentation

```console
overture-codegen generate --format markdown --tag overture:theme=base
```

> **Bathymetry**
> Bathymetry features provide topographic representations of underwater areas…
>
> | Name | Type | Description |
> |---|---|---|
> | `geometry` | geometry | Shape of the underwater area. *Allowed geometry types: MultiPolygon, Polygon* |
> | `depth` | `Depth` | Depth below surface level of the feature in meters. |

`Depth` gets its own page, listing its constraint: `≥ 0`.

---

## …and validation

```console
$ overture-schema validate bathymetry-example.yaml
✓ Successfully validated bathymetry-example.yaml

$ overture-schema validate bad-depth.yaml
 ─ Validation Failed ─────────────────────────────
     depth           -1 ← Input should be greater than or equal to 0
```

The same rule, written once, checked everywhere.

---

<!-- _class: divider -->

# How

---

## Example: a road-safety rating

```python
from typing import Annotated, Literal, NewType
from pydantic import Field
from overture.schema.common import OvertureFeature
from overture.schema.system.geometric import Geometry, GeometryType, GeometryTypeConstraint
from overture.schema.system.numeric import uint8

StarRating = NewType("StarRating", Annotated[
    uint8, Field(ge=1, le=5, description="Star rating from 1 (least safe) to 5 (safest).")])

class RoadSafetyRating(OvertureFeature[Literal["road_safety"], Literal["rating"]]):
    """A road-safety star rating for a stretch of road."""

    geometry: Annotated[Geometry, GeometryTypeConstraint(GeometryType.LINE_STRING),
                        Field(description="The rated stretch of road.")]
    stars: StarRating
```

<!-- _class: dense -->

<!--
We'll take this apart piece by piece over the next slides.
-->

---

## Pick a base class

| Class | Use it for | You get |
|---|---|---|
| `BaseModel` (Pydantic) | nested structs | nothing extra |
| `Feature` | any geospatial feature | `geometry`, optional `id` and `bbox`, GeoJSON in/out |
| `OvertureFeature` | features with a theme and type | required `id`, `theme`, `type`, `version`, optional `sources` |

Your data does not have to be Overture data to use `OvertureFeature`.
Its `theme` tag lets the tools select **your** models.

```python
from overture.schema.system.feature import Feature
from overture.schema.common import OvertureFeature
```

<!--
Import Feature from overture.schema.system.feature. The shorter
`from overture.schema.system import Feature` fails on PyPI 2.0.0 (fixed on main, not released).
-->

---

<!-- _class: divider -->

# Fields

---

## Required or optional?

```python
name: str                       # required: no default
height: float64 | None = None   # optional: may be left out
```

- No default → **required**
- `X | None = None` → **optional**
- `None` is the only default. Don't invent values the data doesn't have.

---

## Types: primitives and numbers

- Primitives: `str`, `bool`, `datetime`, `date`
- Numbers: say how big they are

| Integers | Floats |
|---|---|
| `int8` `int16` `int32` `int64` | `float32` `float64` |
| `uint8` `uint16` `uint32` | |

Sized types map cleanly to Parquet, Arrow, Spark and JSON Schema. When unsure, use `int32` and `float64`.

---

## Types: geometry

```python
geometry: Annotated[
    Geometry,
    GeometryTypeConstraint(GeometryType.POINT),
]
```

- `Geometry` wraps a Shapely geometry
- Restrict the allowed shapes: `POINT`, `LINE_STRING`, `POLYGON`,
  `MULTI_POINT`, `MULTI_LINE_STRING`, `MULTI_POLYGON`, `GEOMETRY_COLLECTION`
- Docs say *Allowed geometry types: Point*; validation rejects anything else

---

## Types: structs

A nested `BaseModel` groups related fields.

```python
@no_extra_fields
class Survey(BaseModel):
    """Who rated the road, and when."""
    assessor: str
    surveyed_on: date | None = None

class RoadSafetyRating(OvertureFeature[...]):
    survey: Survey | None = None
```

In the docs, a struct flattens into rows: `survey.assessor`, `survey.surveyed_on`.

---

## Types: NewTypes

Give a type a **name**, a **description** and **constraints**, then reuse it.

```python
CountryCodeAlpha2 = NewType("CountryCodeAlpha2", Annotated[
    str,
    CountryCodeAlpha2Constraint(),
    Field(description="An ISO 3166-1 alpha-2 country code"),
])
```

Every field that uses it inherits the description and the checks, and the docs give it its own page.

---

## Types: enums with meanings

Most spatial data has coded columns. Write down what the codes **mean**.

```python
class Material(str, DocumentedEnum):
    """Primary material of a building's walls."""

    BRICK = ("brick", "Fired-clay brick masonry.")
    TIMBER = ("timber", "Structural wood framing or log construction.")
```

A list of legal values **and** what each one means: knowledge that otherwise lives in a PDF or in someone's head.

<!--
This is the most valuable thing attendees will take home.
-->

---

<!-- _class: divider -->

# Constraints

---

## Pre-built constraints

**On a field:** `Field(ge=, le=, min_length=, max_length=)`, plus:

`CountryCodeAlpha2Constraint` · `RegionCodeConstraint` · `LanguageTagConstraint`
`HexColorConstraint` · `PhoneNumberConstraint` · `WikidataIdConstraint`
`SnakeCaseConstraint` · `StrippedConstraint` · `UniqueItemsConstraint` · …

**Across fields** (class decorators):

```python
@require_if(["admin_level"], FieldEqCondition("subtype", "region"))
@forbid_if(["country"], FieldEqCondition("subtype", "country"))
@require_any_of("name", "ref")
```

The docs render these as English: *`country` is forbidden when `subtype` = `country`*.

---

## Custom constraints: data, not functions

```python
# ✗ A function: it runs, but no tool can see what it checks
assessor: Annotated[str | None, AfterValidator(check_code)] = None
```

```python
# ✓ A constraint: the rule is data that tools can read
class AssessorCodeConstraint(PatternConstraint):
    """Allows only three-letter upper-case assessor codes."""
    def __init__(self) -> None:
        super().__init__(pattern=r"^[A-Z]{3}$",
                         error_message="Invalid assessor code: {value}")

assessor: Annotated[str | None, AssessorCodeConstraint()] = None
```

Subclass a constraint we provide, or express the rule with bounds, enums and decorators.

---

## What each tool sees

| The same rule, written as… | Docs | JSON Schema |
|---|---|---|
| `@field_validator` / `AfterValidator(func)` | nothing | nothing |
| `PatternConstraint` subclass | *Allows only three-letter upper-case assessor codes* | `"pattern": "^[A-Z]{3}$"` |
| `Field(ge=1, le=5)` | `≥ 1`, `≤ 5` | `minimum`, `maximum` |

Validation enforces all three. Only constraints show up anywhere else.

<!--
PySpark codegen today covers bounds, enums, lengths, geometry types and Overture's own
named constraints. A third party's PatternConstraint subclass (or raw Field(pattern=))
makes `--format pyspark` fail ("No valid value defined for check_pattern"). If asked:
known gap, tracked upstream.
-->

---

<!-- _class: divider -->

# Make it a package

---

## Package bootstrap

```toml
[project]
name = "road-safety"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = ["overture-schema>=2.0.0", "overture-schema-codegen>=2.0.0"]

[project.entry-points."overture.models"]
road_safety_rating = "road_safety:RoadSafetyRating"
```

```text
road-safety/
├── pyproject.toml
└── src/road_safety/
    ├── __init__.py     # re-exports the models
    └── models.py
```

The `overture.models` entry point is how the tools find your models.

---

## Manual creation

1. Write `models.py`
2. Install it: `pip install -e .`
3. Check the tools can see it:

```console
$ overture-schema list-types
road_safety_rating  feature  overture  overture:theme=road_safety

$ overture-schema validate --type road_safety_rating bad.json
            stars      7 ← Input should be less than or equal to 5
   assessor.value "irap" ← Invalid assessor code: irap
```

---

<!-- _class: divider -->

# Outputs

---

## Markdown

```console
overture-codegen generate --format markdown \
    --tag overture:theme=road_safety --output-dir docs/
```

> **RoadSafetyRating**
> A road-safety star rating for a stretch of road.
>
> | Name | Type | Description |
> |---|---|---|
> | `geometry` | geometry | The rated stretch of road. *Allowed geometry types: LineString* |
> | `stars` | `StarRating` | Star rating from 1 (least safe) to 5 (safest). |
> | `assessor` | `string` (optional) | *Allows only three-letter upper-case assessor codes.* |

<!--
Examples: add [[examples.RoadSafetyRating]] rows to pyproject.toml and they appear on the page
(editable/source installs only; codegen reads pyproject.toml by walking up from the module).
-->

---

## STAC: `table:columns`

STAC describes the **envelope**. The model describes the **contents**.

```console
overture-codegen generate --format stac-table-columns --output-dir stac/
```

```json
{"name": "depth", "type": "int32",
 "description": "Depth below surface level of the feature in meters."},
{"name": "geometry", "type": "binary",
 "vector:geometry_types": ["MultiPolygon", "Polygon"]}
```

A catalog built from the file alone gets column **names**. This adds types, descriptions and geometry types.

<!--
Open PR: OvertureMaps/schema#724. Constraints and enum values do not fit in a STAC
column object; the generator logs what it had to drop.
Overture's own catalog (stac.overturemaps.org, built by OvertureMaps/stac) is names-only
today; stac#130 will consume this output once #724 lands.
-->

---

<!-- _class: divider -->

# Faster starts

---

## Tool-based: `schema-bootstrap`

Start from the data instead of a blank page.

```console
$ schema-bootstrap places.shp --class-name UtahPlace \
    --theme places --type place -o model.py
```

- Reads column names, types and geometry from the file (DuckDB)
- Finds small value sets that look like vocabularies
- Reads metadata shipped **beside** the data for descriptions and code lists
- Everything it could not work out becomes a `TODO`

---

## External metadata: ISO 19110

Many government datasets ship a *feature catalogue* next to the data:
`places.shp.ea.iso.xml` (ISO 19110) or `places.shp.xml` (FGDC).

```console
$ schema-bootstrap utah_places.shp --report
sidecar: utah_places.shp.ea.iso.xml
  LSAD         str domain=14 observed=4 UNDECLARED=35
  STATEFP      str observed=1
```

- `LSAD`: the catalogue declares **14** codes; this file uses **4**
- `STATEFP`: looks like a one-value enum; it is one state out of 56
- `35` is in the data but in no catalogue: a question for a person

---

## What you get back

```python
class Lsad(str, DocumentedEnum):
    """Current legal/statistical area description code for place

    TODO: 1 value(s) occur in the data and are NOT declared: '35'.
    """
    V_25 = ("25", "city (suffix)")
    V_43 = ("43", "town (suffix)")
    V_57 = ("57", "census designated place (CDP) (suffix)")
    ...
    V_35 = ("35", "TODO: '35' -- meaning not in any source consulted")
```

The tool finds the values. **What they mean is your job.**

---

## Agent-based: have Claude write it

Point a coding agent at the source of truth and ask for a model.

- The source: a spec, a data dictionary, a JSON Schema, a code-list PDF
- The rules: *use the sized number types; subclass the provided constraints; no validator functions*
- Check its work the way you'd check your own: validate real rows, read the generated docs

**Example:** GATIS, the US active-transportation spec, is published as a spreadsheet export. Its models were generated from a pinned snapshot of that export, and modelling it turned up defects in the spec itself.

<!--
~/src/sethfitz/gatis-schema. The upstream JSON Schema only permits the literal
"(Same as Edge Types)" for edge_type: a note to a human, carried through every export.
-->

---

## Your turn

1. Pick a dataset (or bring your own)
2. Bootstrap a model, or start from the example package
3. Fill in the descriptions and the **meanings** of every coded value
4. Generate the docs and read them

<!-- TODO: starter datasets pending (GEM, GATIS, GBFS, HOT, iRAP) -->
