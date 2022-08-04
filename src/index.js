import { OboGraphViz } from "obographviz";
import BbopGraph from "bbop-graph";

const ONTOLOGY_DICT = {
  FYPO: null,
  GO: null,
};

async function fetchOntologies() {
  const fypo_resp = await fetch(
    "https://raw.githubusercontent.com/pombase/fypo/master/fypo-full.json"
  );
  if (!fypo_resp.ok) {
    throw new Error(`Error! status: ${fypo_resp.status}`);
  }

    const go_resp = await fetch(
      "/go/go.json"
    );
    if (!go_resp.ok) {
      throw new Error(`Error! status: ${go_resp.status}`);
    }

  ONTOLOGY_DICT.FYPO = new OboGraphViz(await fypo_resp.json());
  ONTOLOGY_DICT.GO = new OboGraphViz(await go_resp.json());
}

function formatPredicate(predicate) {
  switch (predicate) {
    case "http://purl.obolibrary.org/obo/BFO_0000050":
      return "part_of";
    case "http://purl.obolibrary.org/obo/BFO_0000051":
      return "has_part";
    case "http://purl.obolibrary.org/obo/fypo#output_of":
      return "output_of";
    case "http://purl.obolibrary.org/obo/fypo#has_output":
      return "has_output";
    case "http://purl.obolibrary.org/obo/RO_0002212":
      return "negatively_regulates";
    case "http://purl.obolibrary.org/obo/RO_0002211":
      return "regulates";
    case "http://purl.obolibrary.org/obo/RO_0002213":
      return "positively_regulates";
    // case "http://purl.obolibrary.org/obo/fypo#has_output":
    //   return "has_output";
    // case "http://purl.obolibrary.org/obo/fypo#has_output":
    //   return "has_output";
    //   case "http://purl.obolibrary.org/obo/fypo#has_output":
    //     return "has_output";
    default:
      return predicate;
  }
}

function formatGraphForDisplay(graph) {
  const relationships = graph.all_edges().map((edge) => {
    return {
      id: edge.object_id(),
      parent: edge.subject_id(),
      child: edge.object_id(),
      type: formatPredicate(edge.predicate_id()),
    };
  });

  const terms = graph.all_nodes().map((node) => {
    return {
      id: node.id(),
      label: node.label(),
    };
  });

  return { terms, relationships };
}

function mergeGraphs(graphs) {
  return graphs.reduce((prev, next) => {
    prev.merge_in(next);
    return prev;
  }, new BbopGraph.graph());
}

async function getGraph(termId, getParents, getChildren) {
  let ontologyName = termId.split(":")[0];

  const ogv = ONTOLOGY_DICT[ontologyName];

  const newGraph = ogv.createBbopGraph();
  const termUrl = `http://purl.obolibrary.org/obo/${termId.replace(":", "_")}`;
  const graphs = [];
  if (getChildren) {
    graphs.push(newGraph.get_descendent_subgraph(termUrl));
  }
  if (getParents) {
    graphs.push(newGraph.get_ancestor_subgraph(termUrl));
  }
  return mergeGraphs(graphs);
}

var mermaidText = "";

function editName(name) {
  // Introduce a <br> each 20 characters so that the text fits in the boxes of mermaid
  return name.replace(/(.{20})/g, "$1<br>");
}

function termWithLink(term, submittedIds) {
  const termId = term.id.split("/").pop().replace("_", ":");

  let linkDict = {
    FYPO: "https://www.pombase.org/term/",
    GO: "https://www.ebi.ac.uk/QuickGO/term/",
  };
  let ontologyName = termId.split(":")[0];
  let text = `<a href=${
    linkDict[ontologyName]
  }${termId}>${termId}</a><br>${editName(term.label)}`;
  if (submittedIds.includes(termId)) {
    text = `<u><strong>${text}</strong></u>`;
  }
  return text;
}

function updateMermaidText(terms, relationships, submittedIds) {
  let mermaidLines = [];
  relationships.forEach((r) => {
    const parent = terms.find((term) => term.id === r.parent);
    const child = terms.find((term) => term.id === r.child);
    mermaidLines.push(
      `      ${parent.id}["${termWithLink(parent, submittedIds)}"]-->|${
        r.type
      }|${child.id}["${termWithLink(child, submittedIds)}"];`
    );
  });
  const left2right = document.getElementById("tree-left2right").checked;
  const firstPart = left2right
    ? "```mermaid\ngraph LR;\n"
    : "```mermaid\ngraph BT;\n";
  mermaidText = firstPart + mermaidLines.join("\n") + "\n```\n";
}

async function makePostRequest(submitEvent) {
  submitEvent.preventDefault();
  const submittedIds = document
    .getElementById("ontology-term")
    .value.split(",");
  const getParents = document.getElementById("requestParents").checked;
  const getChildren = document.getElementById("requestChildren").checked;
  const mergedGraph = mergeGraphs(
    await Promise.all(
      submittedIds.map(
        async (id) => await getGraph(id, getParents, getChildren)
      )
    )
  );

  if (mergedGraph.all_nodes().length === 0) {
    return;
  }

  const displayGraph = formatGraphForDisplay(mergedGraph);
  const codeblock = document.getElementById("markdown-result");
  const mermaidblock = document.getElementById("mermaid");
  updateMermaidText(
    displayGraph.terms,
    displayGraph.relationships,
    submittedIds
  );

  codeblock.textContent = mermaidText;
  const textArray = mermaidText.split(/\r?\n/);
  const mermaidOnlyText = textArray.slice(1, textArray.length - 2).join("\n");
  mermaidblock.textContent = mermaidOnlyText;
  mermaidblock.removeAttribute("data-processed");
  mermaid.init(undefined);
  const svgElement = document.getElementsByTagName("svg")[0];
  svgElement.style.maxWidth = "unset";
  svgElement.style.width = "unset";
}
function copyText() {
  const codeblock = document.getElementById("markdown-result");
  navigator.clipboard
    .writeText(codeblock.textContent)
    .then(() => {
      alert("successfully copied");
    })
    .catch(() => {
      alert("something went wrong");
    });
}

window.onload = () => {
  document
    .getElementById("copytext-button")
    .addEventListener("click", copyText);
  fetchOntologies().then(() => {
    document.getElementById("submit-button").removeAttribute("hidden");
    // document.getElementById("loading-ontologies").removeAttribute("hidden");
    document
      .getElementById("main-form")
      .addEventListener("submit", makePostRequest);
  });
};
