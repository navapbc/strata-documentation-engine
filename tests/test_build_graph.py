from scripts.build_graph import (
    build_graph, feature_key_gaps, component_key_gaps, render_index,
)

DOCS = [
    {"id": "sdk-forms", "title": "Forms", "source": "strata-sdk", "doc_type": "feature",
     "tags": ["forms"], "related": [], "feature_keys": ["application-form"], "demonstrates": [],
     "summary": "f", "path": "sources/strata-sdk/forms.md"},
    {"id": "oscer-forms", "title": "Uses Forms", "source": "oscer", "doc_type": "example",
     "tags": ["forms"], "related": [], "feature_keys": [], "demonstrates": ["application-form"],
     "summary": "e", "path": "sources/oscer/forms.md"},
]

# Platform-axis fixtures: a CLI doc that `manages` the infra doc, which `integrates_with` the app doc.
PLATFORM_DOCS = [
    {"id": "infra-overview", "title": "template-infra", "source": "template-infra",
     "doc_type": "guide", "tags": ["infra"], "related": [],
     "component_keys": ["template-infra"], "integrates_with": ["template-application-rails"],
     "summary": "infra", "path": "sources/template-infra/overview.md"},
    {"id": "rails-overview", "title": "Rails template", "source": "app-template",
     "doc_type": "guide", "tags": ["rails"], "related": [],
     "component_keys": ["template-application-rails"],
     "summary": "rails", "path": "sources/app-template/overview.md"},
    {"id": "cli-install", "title": "nava-platform install", "source": "platform-cli",
     "doc_type": "guide", "tags": ["cli"], "related": [],
     "manages": ["template-infra", "template-application-rails"],
     "summary": "cli", "path": "sources/platform-cli/install.md"},
]


def test_nodes_include_docs_and_source_nodes_sorted():
    g = build_graph(DOCS)
    ids = [n["id"] for n in g["nodes"]]
    assert ids == sorted(ids)
    assert "sdk-forms" in ids
    assert "source:strata-sdk" in ids
    assert "source:oscer" in ids


def test_documents_edges_link_source_to_doc():
    g = build_graph(DOCS)
    assert {"from": "source:strata-sdk", "to": "sdk-forms", "rel": "documents"} in g["edges"]


def test_example_of_resolves_via_feature_key_registry():
    # oscer-forms `demonstrates` application-form, which sdk-forms `feature_keys` owns
    g = build_graph(DOCS)
    assert {"from": "oscer-forms", "to": "sdk-forms", "rel": "example-of"} in g["edges"]


def test_related_emits_related_to_not_example_of():
    docs = [dict(DOCS[0]), dict(DOCS[1], related=["sdk-forms"], demonstrates=[])]
    g = build_graph(docs)
    assert {"from": "oscer-forms", "to": "sdk-forms", "rel": "related-to"} in g["edges"]
    assert all(e["rel"] != "example-of" for e in g["edges"])


def test_feature_key_gaps_flags_unowned_demonstrates():
    docs = [dict(DOCS[1], demonstrates=["business-process"])]  # no doc owns it
    gaps = feature_key_gaps(docs)
    assert {"doc": "oscer-forms", "key": "business-process"} in gaps


def test_manages_resolves_via_component_registry():
    # cli-install `manages` template-infra, which infra-overview `component_keys` owns
    g = build_graph(PLATFORM_DOCS)
    assert {"from": "cli-install", "to": "infra-overview", "rel": "manages"} in g["edges"]
    assert {"from": "cli-install", "to": "rails-overview", "rel": "manages"} in g["edges"]


def test_integrates_with_resolves_via_component_registry():
    # infra-overview `integrates_with` template-application-rails, owned by rails-overview
    g = build_graph(PLATFORM_DOCS)
    assert {"from": "infra-overview", "to": "rails-overview", "rel": "integrates-with"} in g["edges"]


def test_component_key_gaps_flags_unowned_manages():
    docs = [dict(PLATFORM_DOCS[2], manages=["template-application-nextjs"])]  # no doc owns it
    gaps = component_key_gaps(docs)
    assert {"doc": "cli-install", "key": "template-application-nextjs"} in gaps


def test_edges_are_sorted_and_deduped():
    g = build_graph(DOCS + DOCS)  # duplicate input rows
    assert g["edges"] == sorted(g["edges"], key=lambda e: (e["from"], e["to"], e["rel"]))
    assert len(g["edges"]) == len({(e["from"], e["to"], e["rel"]) for e in g["edges"]})


def test_render_index_groups_by_source():
    out = render_index(DOCS)
    assert "## oscer" in out
    assert "## strata-sdk" in out
    assert "[Forms](sources/strata-sdk/forms.md)" in out
