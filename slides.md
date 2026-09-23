---
marp: true
theme: overture
paginate: true
title: Overture Schema Workshop
description: Model your own data with the Overture schema framework — CNG Forum 2026
---

<!-- _class: title -->
<!-- _paginate: false -->

# Model your data with Overture's schema system

Overture Schema Workshop · CNG Forum 2026 · Snowbird

---

## Today

1. **Background**: JSON Schema and Pydantic
2. **Why** write a schema as code
3. **How**: a model, its fields, its constraints
4. Turn it into a **package**, then into **docs, validation and catalog columns**
5. Faster starts: **tools** and **agents**

```console
pip install overture-schema overture-schema-codegen   # Python 3.10+
```

<!--
Codespaces run Python 3.12. Everything in this deck was run against the 2.0.0
packages on PyPI.
-->

---

<!-- _class: divider -->

# Background

---

## JSON Schema

A JSON document that describes what **other** JSON documents must look like.

```json
{"type": "object",
 "properties": {
   "stars": {"type": "integer", "minimum": 1, "maximum": 5,
             "description": "Star rating from 1 (least safe) to 5 (safest)."},
   "road_type": {"enum": ["motorway", "arterial", "local"],
                 "description": "Kind of road that was rated."}},
 "required": ["stars"]}
```

- **Rich types**: nested objects, arrays, enums, reusable definitions
- **Constraints**: required fields, bounds, patterns
- **Descriptions** on every field
- Language-neutral: validators exist for most programming languages

If your data already has a JSON Schema, it already has a model.

<!-- _class: dense -->

<!--
Overture's own schema was first written this way, by hand, in YAML (schema/ in the repo;
deprecated, removal December 2026).
-->

---

## From JSON Schema to GeoJSON

JSON Schema describes and validates **JSON**, so JSON is the natural way to write the data down. For geospatial features, that means **GeoJSON**.

```json
{"type": "Feature",
 "id": "rsr-0001",
 "geometry": {"type": "LineString", "coordinates": [[-122.68, 45.52], [-122.67, 45.53]]},
 "properties": {"stars": 4,
                "survey": {"assessor": "iRAP", "surveyed_on": "2026-05-01"}}}
```

- The envelope holds `id`, `bbox` and `geometry`
- Your fields go in `properties`, and they can nest, if your tools support it
- Geometry is written as coordinates

---

## Nested vs tabular

| | GeoJSON | GeoParquet | CSV | Shapefile |
|---|---|---|---|---|
| Fields | under `properties` | columns | columns | columns |
| Geometry | coordinates | WKB or GeoArrow | WKT | binary shapes |
| Nested objects | yes | structs | JSON text | JSON text |
| Keys per feature | its own | one set of columns | one set | one set |

When features differ, intentionally or by accident, every key that appears anywhere becomes a column, and rows get **wide and mostly null**:

```text
id   stars  lanes  surface
a    4      null   null
b    2      4      asphalt
```

<!-- _class: dense -->

<!--
GeoJSON features in one FeatureCollection may differ in which keys they carry, not just in
null values. We assume GeoJSON translates cleanly into Shapefile or GeoParquet; these rows are
the seams. Modelling as if every feature can carry anything produces very wide tables.
Measured with GDAL 3.13.3 (ogr2ogr): a nested GeoJSON object reads as String(JSON). To
Shapefile it becomes JSON text in a String(80) column (dBase strings cap at 254 chars).
String arrays fail on Shapefile unless -mapFieldType StringList=String, then write as
"(2:x,y)". GeoJSON -> Parquet via ogr2ogr ALSO writes the object as a JSON string, not a
struct: the format has structs, the conversion doesn't infer them. The model knows.
CSV via ogr2ogr: geometry only with -lco GEOMETRY=AS_WKT (the default drops it); objects and
arrays both become JSON text.
GeoParquet 1.1 added native encodings "based on GeoArrow" (point, linestring, polygon, multi*);
WKB stays "the preferred option for maximum portability" (geoparquet.org/releases/v1.1.0).
Feature handles the envelope (fields in and out of properties), Geometry the encoding
(GeoJSON coordinates or WKB), and BBox GeoJSON's [xmin, ymin, xmax, ymax] array or
Parquet's xmin/ymin/xmax/ymax struct.
Overture ships Parquet; GeoJSON is for single features, extracts and examples.
In Pydantic terms: GeoJSON is JSON mode (model_validate_json), the flat row is Python mode
(model_validate). CONCEPTS.md "Why there's an envelope at all" has the long version.
-->

---

## Pydantic

A Python library: describe data as **classes with type hints**, and it checks input against them.

<!-- TODO(screenshot): VS Code hover on a model field, captured in the workshop Codespace -->

```python
class Rating(BaseModel):
    stars: Annotated[int, Field(ge=1, le=5)]
    road_type: str | None = None

Rating.model_validate_json('{"stars": 7}')
```

```text
1 validation error for Rating
stars
  Input should be less than or equal to 5
```

---

## How they relate

Pydantic **generates** JSON Schema from a model:

```python
from overture.schema.system.json_schema import json_schema
json_schema(Rating)
```

```json
{"$schema": "https://json-schema.org/draft/2020-12/schema",
 "type": "object", "title": "Rating", "required": ["stars"],
 "properties": {"stars": {"type": "integer", "minimum": 1, "maximum": 5},
                "road_type": {"type": "string"}}}
```

Overture uses Pydantic because being Python makes these possible:

- **Tooling**: editor support, and generators for Markdown docs and PySpark validation
- **Nested and tabular**: `Feature`, `Geometry` and `BBox` let one model describe a GeoJSON feature *and* a flat Parquet row

<!-- _class: dense -->

<!--
Rationale, from CONCEPTS.md "Why Pydantic rather than JSON Schema": hand-written JSON Schema
was hard to write correctly and verify, had little IDE support, no refactoring, generic tools
couldn't tailor output, and changes needed coordinating across artifacts. The YAML schema
(schema/ in the repo) is deprecated, scheduled for removal December 2026.
JSON output above is real json_schema(Rating) output, reordered, property title keys dropped.
The wrapper vs plain Rating.model_json_schema(): it declares the $schema dialect, and an
optional field becomes {"type": "string"} (may be omitted) instead of
anyOf [string, null] with default null (may be null). `overture-schema json-schema` uses it.
Those two are all it changes (source of json_schema() in 2.0.0); it also accepts a union of models.
Nested/tabular, checked on the my-schema template: model_validate_json(GeoJSON feature) and
model_validate(flat row, geometry as WKB bytes) produce equal objects: evidence that one model
describes both shapes. The point is the model, not parsing into Python; the modelled shape feeds
JSON Schema, docs and PySpark checks too.
-->

---

<!-- _class: divider -->

# Why

---

## One model, many outputs

The model is the **source of truth**. Everything else is generated from it.

```text
                    ┌──▶  JSON Schema
                    ├──▶  Markdown reference docs
   models.py  ──────┼──▶  Validation (Python, CLI)
                    ├──▶  PySpark checks for Parquet at scale
                    └──▶  STAC table:columns  (coming)
```

Types, **constraints**, and **commentary** live in one place, so they cannot drift apart.

Python is where you **write** the model. The data is **read** elsewhere: DuckDB, Spark, GDAL, QGIS. None of them runs your Python.

---

## Richer than a data dictionary

A data dictionary types a column with its **storage format**:

| Column | Type | Description |
|---|---|---|
| `stars` | integer | Star rating |
| `road_type` | string | Road type code |

A model gives it a **type of its own**, with the range, the meaning and every legal value attached:

```python
StarRating = NewType("StarRating", Annotated[uint8, Field(
    ge=1, le=5, description="Star rating from 1 (least safe) to 5 (safest).")])

class RoadType(str, DocumentedEnum):
    """Kind of road that was rated."""
    MOTORWAY = ("motorway", "Divided highway with controlled access.")
    LOCAL = ("local", "Street serving the properties along it.")
```

<!-- _class: dense -->

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

## Validating GeoParquet as GeoJSON features

[`gpq`](https://github.com/planetlabs/gpq) converts GeoParquet to GeoJSON features:

```console
$ gpq convert bathymetry.parquet --to geojson \
  | jq '.features |= map(.id = .properties.id
        | .bbox = (.properties.bbox | [.xmin, .ymin, .xmax, .ymax])
        | del(.properties.id, .properties.bbox))' \
  | overture-schema validate --type bathymetry -
✓ Successfully validated <stdin>
```

GeoJSON keeps `id` and `bbox` at the top level of a feature. `gpq` puts every column under `properties`, so `jq` lifts those two out; the result is a valid GeoJSON feature.

<!--
Run 2026-09-22: 3 rows of release 2026-08-19.0 theme=base/type=bathymetry, extracted with
DuckDB (hive columns theme/type included), gpq 0.24.0 (brew install planetlabs/tap/gpq).
Without the jq step: "illegal properties in feature JSON: ['bbox', 'id'] (these properties may
only appear at the top level...)". Negative control: setting one feature's depth to -1 in the
stream reports "depth -1 <- Input should be greater than or equal to 0" at feature [1], exit 1.
Without --type, validate warns the data matches multiple types.
Why the jq: gpq's GeoJSON writer (internal/geojson/recordwriter.go, HEAD a5a6b20) emits only
type/properties/geometry. It can't know which column is the id (GeoParquet has no id
convention), and it ignores GeoParquet 1.1's covering.bbox, which Overture's files declare
(checked on the 2026-08-19.0 bathymetry files). Measured 2026-09-23 on gpq's own
example-v1.1.0-covering.parquet: --from auto and --from geoparquet give the same output, bbox
column under properties. The 3-row extract above is GeoParquet 1.0 (DuckDB rewrote it), so it
carries no covering either. Open upstream: planetlabs/gpq#270 adds bbox support (no reviews;
last gpq release v0.24.0, Nov 2024). Nothing filed for an id column. For data at scale, use the
PySpark checks instead.
-->

---

## Validating GeoParquet as flat rows

```console
$ duckdb <<'SQL' | overture-schema validate --type division --show-field id -
INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';
COPY (SELECT ST_AsGeoJSON(geometry) AS geometry, * EXCLUDE geometry
      FROM read_parquet('s3://overturemaps-us-west-2/release/2026-08-19.0/theme=divisions/type=division/*.parquet')
      LIMIT 100)
TO '/dev/stdout' (FORMAT JSON, ARRAY false);
SQL
```

```text
 ─ [0] id=23e81262-d6ed-45a3-a1a0-4bc6a2... ──────────────────────
        id "23e81262-d6ed-45a3-a1a0-4bc6a2a887d8"
   country          <missing> ← Input should be a valid string
```

DuckDB writes each row flat, with only the geometry as GeoJSON. `Feature` reads flat rows directly, so no `jq`. The failure is real data: a locality at the South Pole, with no country.

<!-- _class: dense -->

<!--
Run 2026-09-22 against release 2026-08-19.0 with the PyPI 2.0.0 packages: 99 of the 100 rows
validate. The failing one is a known data issue (the data team knows).
ST_AsGeoJSON converts only the geometry column; the record is not a GeoJSON Feature (no
"type": "Feature", no properties envelope). The gpq route produces real GeoJSON features.
-->

---

<!-- _class: divider -->

# How

---

## Example: a road-safety rating

```python
from typing import Annotated, NewType
from pydantic import Field
from overture.schema.system.feature import Feature
from overture.schema.system.geometric import Geometry, GeometryType, GeometryTypeConstraint
from overture.schema.system.numeric import uint8

StarRating = NewType("StarRating", Annotated[
    uint8, Field(ge=1, le=5, description="Star rating from 1 (least safe) to 5 (safest).")])

class RoadSafetyRating(Feature):
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
| `Feature` | **your features** | `geometry`, optional `id` and `bbox`; describes GeoJSON features and flat rows |
| `BaseModel` (Pydantic) | nested structs, and tables without geometry | nothing extra |
| `OvertureFeature` | Overture's own themes | adds required `id`, `theme`, `type`, `version`; optional `sources` |

Start from `Feature`.

```python
from overture.schema.system.feature import Feature
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
- `None` is the only default

---

## Why no other defaults?

A default lives in the Python model. **It does not travel with the data.**

- **Pydantic** fills it in when parsing: a value the input never had
- **Parquet** has no defaults: absent is `null`
- **Databases** can set a column `DEFAULT`: yet another source of truth, free to disagree with the model
- **SQL** over the data: `WHERE level = 0` misses every row that relied on the default

If absence means something, say so in the field's **description**. If a value belongs in the data, the publisher writes it.

<!--
Source: OvertureMaps/schema#695 (policy, open). Measured there against release 2026-08-19.0:
every non-null default then in the schema occurred in zero published rows. PR #697 removed them.
Only someone parsing through the Pydantic models ever saw the default.
-->

---

## Field names: aliases

Python names fields in `snake_case`, and some names are off limits. The data keeps its own. An **alias** connects the two.

```python
class Place(Feature):
    lsad: Annotated[str | None, Field(alias="LSAD")] = None  # the column is LSAD
    class_: Annotated[PlaceClass, Field(alias="class")]      # class is a Python keyword
```

- Validation, JSON Schema, docs and PySpark all use the **alias**, the name in the data
- Your Python code uses the field name: `place.lsad`
- Data that says `lsad` is **ignored**, not rejected

<!--
Measured on overture-schema 2.0.0 with the my-schema template plus an aliased field:
{"LSAD": "25"} populates lsad from a GeoJSON feature and from a flat row; {"lsad": "25"} leaves it
None with no error (Feature ignores unknown keys). json_schema() lists "LSAD"; the Markdown docs'
Name column says LSAD; the PySpark StructField is "LSAD". model_dump() writes lsad unless you
pass by_alias=True.
Overture's own schema aliases class_ to "class" on buildings, land use, land, water,
infrastructure, roads, rail and the divisions types.
PEP 8: snake_case for attribute names, PascalCase for classes (see the Lsad note).
schema-bootstrap currently lower-cases column names WITHOUT an alias, so its models silently
ignore upper-case columns; add aliases by hand until that's fixed.
-->

---

## Types: primitives and numbers

- Primitives: `str`, `bool`, `datetime`, `date`
- Numbers: say how big they are

| Integers | Floats |
|---|---|
| `int8` `int16` `int32` `int64` | `float32` `float64` |
| `uint8` `uint16` `uint32` | |

Sized types map directly to column types in Parquet, Arrow, Spark and databases like PostgreSQL. JSON only has integers and numbers, so JSON Schema keeps an integer's size as `minimum`/`maximum` bounds and a float's not at all. When unsure, use `int32` and `float64`.


<!--
PostgreSQL has no unsigned integers: uint8/uint16 fit smallint/integer, uint32 needs bigint.
-->
---

## Types: geometry

```python
geometry: Annotated[
    Geometry,
    GeometryTypeConstraint(GeometryType.POLYGON, GeometryType.MULTI_POLYGON),
]
```

- The field declares a geometry, not an encoding: GeoJSON coordinates, WKB (as in GeoParquet) and WKT all fit it
- Restrict the allowed shapes: `POINT`, `LINE_STRING`, `POLYGON`,
  `MULTI_POINT`, `MULTI_LINE_STRING`, `MULTI_POLYGON`, `GEOMETRY_COLLECTION`
- List one type or several; docs say *Allowed geometry types: MultiPolygon, Polygon*, and validation rejects anything else

<!--
Checked on overture-schema 2.0.0: a Geometry field accepts a GeoJSON dict, WKB bytes and a WKT
string alike, and rejects malformed input in each form. In Python the value is a Shapely
geometry, and it serializes back to GeoJSON in JSON mode.
Useful for someone scripting against the model; not the point of declaring the field.
-->

---

## Types: structs

A nested `BaseModel` groups related fields.

```python
@no_extra_fields
class Survey(BaseModel):
    """Who rated the road, and when."""
    assessor: str
    surveyed_on: date | None = None

class RoadSafetyRating(Feature):
    survey: Annotated[
        Survey | None, Field(description="The survey this rating came from.")
    ] = None
```

---

## Structs in the docs

The feature's page flattens the struct into dotted rows:

| Name | Type | Description |
|---|---|---|
| `survey` | `Survey` (optional) | The survey this rating came from. |
| `survey.assessor` | `string` | |
| `survey.surveyed_on` | `date` (optional) | |

`survey`'s description comes from its **field**; `Survey`'s docstring goes on its own page.

<!--
Real output: overture-codegen generate --format markdown --tag my_schema, from the
my-schema template, survey rows only (geometry, stars and the rest omitted). Constraints on a struct's fields show on
the struct's own page, not on the flattened rows.
Write a description on every field: it says what the field is FOR, which the type's docstring
can't (origin: Address and destination: Address share a docstring). Today a field with no
description renders an empty cell, even when its type has a docstring (2.0.0, checked for
structs and enums). Codegen will probably fall back to the type's docstring in future
(tracked in the schema workspace); a field's own description will still win.
-->

---

## Types: NewTypes

Define a **domain type** once: a name, a description and constraints.

```python
CountryCodeAlpha2 = NewType("CountryCodeAlpha2", Annotated[
    str,
    CountryCodeAlpha2Constraint(),
    Field(description="An ISO 3166-1 alpha-2 country code"),
])
```

- **Reuse**: every field that uses it inherits the description and the checks, and the docs give it its own page
- **Type safety**: a type checker (ty, mypy) won't let a plain `str` stand in for a `CountryCodeAlpha2`

<!--
Checked on overture-schema 2.0.0, a function taking CountryCodeAlpha2 called with "US":
ty 0.0.81 (what the workshop Codespace runs): Expected `CountryCodeAlpha2`, found
`Literal["US"]`; the model field reveals as CountryCodeAlpha2, and Place(country="US") passes.
mypy: incompatible type "str"; expected "CountryCodeAlpha2". It also flags
Place(country="US"), since mypy (without the Pydantic plugin) sees the NewType, not the string
Pydantic accepts. Runtime: Place(country="USA") is rejected.
pyright, which is what Pylance in VS Code runs, rejects the type itself: "Variable not allowed
in type expression", and the field's type shows as Unknown. NewType's second argument is meant
to be a class, not Annotated[...]; the library carries "# type: ignore [type-arg]" for mypy.
That is why the Codespace installs ty rather than relying on Pylance.
-->

---

## Types: enums with meanings

Most spatial data has coded columns. Write down what the codes **are** and what they **mean**.

```python
class Material(str, DocumentedEnum):
    """Primary material of a building's walls."""

    BRICK = ("brick", "Fired-clay brick masonry.")
    TIMBER = ("timber", "Structural wood framing or log construction.")
```

A `DISTINCT` over an extract finds only the values that extract contains. Listing every legal value, and what each one means, records what otherwise lives in a PDF or in someone's head.

<!--
This is the most valuable thing attendees will take home.
The schema-bootstrap slides later show the extract problem on real data: TIGER's LSAD declares
14 codes in its ISO 19110 catalogue; the Utah extract contains 4, plus one (35) no catalogue lists.
-->

---

<!-- _class: divider -->

# Constraints

---

## Pre-built constraints

**On a field:** `Field(ge=, le=, min_length=, max_length=)`, plus, among others:

<div class="list-cols">

- `CountryCodeAlpha2Constraint`
- `RegionCodeConstraint`
- `LanguageTagConstraint`
- `HexColorConstraint`
- `PhoneNumberConstraint`
- `WikidataIdConstraint`
- `SnakeCaseConstraint`
- `StrippedConstraint`
- `UniqueItemsConstraint`

</div>

**Across fields** (class decorators):

```python
@require_if(["admin_level"], FieldEqCondition("subtype", "region"))
@forbid_if(["country"], FieldEqCondition("subtype", "country"))
@require_any_of("name", "ref")
```

The docs render these as English: *`country` is forbidden when `subtype` = `country`*.

---

## Custom rules: data, not functions

```python
# ✗ A function: it runs, but no tool can see what it checks
class RoadSafetyRating(Feature):
    @model_validator(mode="after")
    def motorways_need_speed_limit(self):
        if self.road_type == "motorway" and self.speed_limit_kph is None:
            raise ValueError("speed_limit_kph is required on motorways")
        return self
```

```python
# ✓ Data: the same rule, in a form tools can read
@require_if(["speed_limit_kph"], FieldEqCondition("road_type", "motorway"))
class RoadSafetyRating(Feature):
    ...
```

Express rules with the bounds, enums and decorators we provide, or subclass an available constraint.

<!--
Subclassing: a custom FieldConstraint reaches the docs and JSON Schema, but PySpark
codegen rejects constraint classes it doesn't know (OvertureMaps/schema#632).
PatternConstraint is being reworked; don't teach subclassing it yet.
-->

---

## What each tool sees

| The same rule, written as… | Docs | JSON Schema | PySpark |
|---|---|---|---|
| `@model_validator` function | nothing | nothing | nothing |
| `@require_if(...)` | *`speed_limit_kph` is required when `road_type` = `motorway`* | `if` / `then` | `check_require_if` |
| `Field(ge=1, le=5)` | `≥ 1`, `≤ 5` | `minimum`, `maximum` | `check_bounds` |

Validation enforces all three. Only the data forms reach anything else.

<!--
PySpark drops the function silently: generation succeeds and the generated checks
pass rows the Python model rejects.
A decorator rule reports only once every field is valid, so show it with a row
that is otherwise clean (my-schema/examples/motorway-without-speed-limit.json).
-->

---

<!-- _class: divider -->

# Make it a package

---

## Package bootstrap

```toml
[project]
name = "my-schema"
version = "0.1.0"
dependencies = ["overture-schema>=2.0.0", "overture-schema-codegen>=2.0.0"]

[project.entry-points."overture.models"]
road_safety_rating = "my_schema:RoadSafetyRating"
```

```text
my-schema/
├── pyproject.toml
└── src/my_schema/
    ├── __init__.py     # re-exports the models
    ├── models.py
    └── tags.py         # next slide
```

The `overture.models` entry point is how the tools find your models.

<!--
The Codespaces environment ships this as a template package (my-schema/ in the
workshop repo), already installed in editable mode.
-->

---

## Selecting your models: tags

The tools select models by **tag**. A tag provider tags your package's models:

```python
def my_schema_provider(types, key, tags):
    if key.entry_point.startswith("my_schema:"):
        tags.add("my_schema")
    return tags
```

```toml
[project.entry-points."overture.tag_providers"]
my_schema = "my_schema.tags:my_schema_provider"
```

Now `--tag my_schema` works in `list-types`, `validate`, `json-schema` and `overture-codegen`.

<!--
The feature, system: and overture: tag namespaces are reserved; a provider that sets
one is warned and ignored. Tags can say more than "mine": AUTHORING.md's example tags
experimental models.
-->

---

## Manual creation

1. Edit `my-schema/src/my_schema/models.py` in the Codespaces editor
2. Registered a new model? Run `uv sync --all-packages`
3. Check the tools can see it, then validate some data:

```console
$ overture-schema list-types --tag my_schema
road_safety_rating  feature  my_schema

$ overture-schema validate my-schema/examples/bad.json
          geometry      Point ← geometry type not allowed: <GeometryType.POINT: …>
             stars          7 ← Input should be less than or equal to 5
   survey.rated_by       "me" ← Extra inputs are not permitted
```

<!-- _class: dense -->

<!--
No venv activation shown: the Codespace puts .venv/bin on PATH (remoteEnv in
devcontainer.json, on the devcontainer-py312 branch / workshop#60, not on main yet).
Why --all-packages: my-schema is a uv workspace member sharing the root .venv. Measured
2026-09-23: a bare `uv sync` inside my-schema/ syncs only that member and REMOVES the
workshop's other packages (jupyter, duckdb, ...). `uv sync --all-packages` keeps them and
registers a new entry point from any directory (same as schema-workspace's `make install`;
the workshop has no extras, so --all-extras adds nothing).
-->

---

<!-- _class: divider -->

# Outputs

---

## Markdown

```console
overture-codegen generate --format markdown \
    --tag my_schema --output-dir docs/
```

> **RoadSafetyRating**
> A road-safety star rating for a stretch of road.
>
> | Name | Type | Description |
> |---|---|---|
> | `geometry` | geometry | The rated stretch of road. *Allowed geometry types: LineString* |
> | `stars` | `StarRating` | Star rating from 1 (least safe) to 5 (safest). |
> | `road_type` | `RoadType` (optional) | Kind of road that was rated. *`speed_limit_kph` is required when `road_type` = `motorway`* |

<!--
Examples: add [[examples.RoadSafetyRating]] rows to pyproject.toml and they appear on the page
(editable/source installs only; codegen reads pyproject.toml by walking up from the module).
-->

---

## STAC: `table:columns`

STAC describes the **envelope**: the dataset's metadata. The model describes the **contents**: the structure of the table itself.

```console
overture-codegen generate --format stac-table-columns --output-dir stac/
```

```json
{"name": "depth", "type": "int32",
 "description": "Depth below surface level of the feature in meters."},
{"name": "geometry", "type": "binary",
 "vector:geometry_types": ["MultiPolygon", "Polygon"]}
```

A catalog built from the file alone gets column **names**. This adds types, descriptions and **declared** geometry types: what the model allows, not what the file contains.

<!--
Declared, like an enum's values: the model says MultiPolygon or Polygon; a given file may hold
only one. Same limitation, other direction, as a DISTINCT over an extract.
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

<!--
Lsad, not LSAD: Python names classes in PascalCase (PEP 8's "CapWords"), so the tool builds a
class name from the column name by lower-casing it and capitalising each word: LSAD -> Lsad,
place_type -> PlaceType. It can't tell an acronym from a word. PEP 8 itself keeps acronyms
upper-case (HTTPServerError), so renaming the class LSAD is fine; it's a Python name only.
The codes are untouched: the value is still "25". Members are UPPER_CASE constants, and a
code starting with a digit gets a V_ prefix because a Python name can't start with one.
-->

---

## Agent-based: have Claude write the generator

An agent that reads a spec and writes the models is **transcribing**, and transcription loses fidelity. Ask it instead for a **script** that reads the source and emits the Pydantic.

- **The source**: a spec, a data dictionary, a JSON Schema, or the data files themselves: a snapshot, not a live URL
- **Checkable**: regenerate and diff against the models you have edited
- **The rules**: sized number types, provided constraints, no validator functions

**Example:** GATIS, the US active-transportation spec, is published as a spreadsheet export. Its models are generated from a pinned snapshot, a second script diffs the generated JSON Schema against upstream's, and the process turned up defects in the spec itself.

<!--
Seth, 2026-09-22: when he first built out the Overture models he had an agent write the models
directly (with Sonnet 3.7, he thinks), and they were subject to lots of problems. Treated as code
generation, where code generates other code, the result is checkable and traceable to a source
of truth.
Fidelity: a transcribing agent can drop enum values, paraphrase descriptions, or add constraints
the spec never stated, and nothing flags it. (Illustrative failure modes, not a record of what
went wrong in Seth's Overture attempt.) A generator copies what is there; when it is wrong, it is
wrong the same way on every field, so a diff shows it. That answers "but the agent wrote the
script too."
The generated models are a seed, not the final word: gatis-schema's bootstrap-models refuses to
overwrite the hand-edited models, and `--into DIR` writes a fresh bootstrap to diff against them.
That is what "Checkable" means on the slide.
GATIS: ~/src/sethfitz/gatis-schema -- scripts/bootstrap-models (from the pinned spec snapshot),
scripts/compare-json-schema. The upstream JSON Schema only permits the literal
"(Same as Edge Types)" for edge_type: a note to a human, carried through every export.
-->

---

## Your turn

1. Pick a dataset (or bring your own)
2. Bootstrap a model, or copy the example in `my-schema`
3. Fill in the descriptions and the **meanings** of every coded value
4. Generate the docs and read them

<!-- TODO: starter datasets pending (GEM, GATIS, GBFS, HOT, iRAP) -->
