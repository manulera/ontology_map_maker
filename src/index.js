import { OboGraphViz } from "obographviz";

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

  //   const go_resp = await fetch(
  //     "http://current.geneontology.org/ontology/go.json"
  //   );
  //   if (!go_resp.ok) {
  //     throw new Error(`Error! status: ${go_resp.status}`);
  //   }

  ONTOLOGY_DICT.FYPO = new OboGraphViz(await fypo_resp.json());
  //   ONTOLOGY_DICT.GO = new OboGraphViz(await go_resp.json());
}

async function getGraph(termId) {
  const element = document.createElement("div");
  let ontologyName = termId.split(":")[0];

  const ogv = ONTOLOGY_DICT[ontologyName];

  const newGraph = ogv.createBbopGraph();
  const termUrl = `http://purl.obolibrary.org/obo/${termId.replace(":", "_")}`;
  const parentGraph = newGraph.get_descendent_subgraph(termUrl);
  const childGraph = newGraph.get_ancestor_subgraph(termUrl);
  parentGraph.merge_in(childGraph);
  const relationships = parentGraph.all_edges().map((edge) => {
    return {
      id: edge.object_id(),
      parent: edge.subject_id(),
      child: edge.object_id(),
      type: edge.predicate_id(),
    };
  });

  const terms = parentGraph.all_nodes().map((node) => {
    console.log(node);
    return {
      id: node.id(),
      label: node.label(),
    };
  });

  return { terms, relationships };
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
    console.log(r.type);
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

  const graph = await getGraph(submittedIds[0]);

  const codeblock = document.getElementById("markdown-result");
  const mermaidblock = document.getElementById("mermaid");
  updateMermaidText(graph.terms, graph.relationships, submittedIds);

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
