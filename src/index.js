import { OboGraphViz } from "obographviz";
import BbopGraph from "bbop-graph";

const ONTOLOGY_DICT = {
  FYPO: { url: 'https://raw.githubusercontent.com/manulera/ontology_map_maker/master/ontology_files/fypo-full.json', graph: null },
  GO: { url: 'https://raw.githubusercontent.com/manulera/ontology_map_maker/master/ontology_files/go.json', graph: null },
  CL: { url: 'https://raw.githubusercontent.com/manulera/ontology_map_maker/master/ontology_files/cl-full.json', graph: null },
  FBcv: {url: 'https://raw.githubusercontent.com/manulera/ontology_map_maker/master/ontology_files/fbcv-full.json', graph: null}
};

async function fetchOntologies() {
  for (const key of Object.keys(ONTOLOGY_DICT)) {
    const ontology = ONTOLOGY_DICT[key]
    document.getElementById("loading-ontologies").insertAdjacentHTML('beforeEnd', `<div>Fetching ${key}...</div>`)
    const resp = await fetch(ontology.url);
    if (!resp.ok) {
      document.getElementById("loading-ontologies").insertAdjacentHTML('beforeEnd', `<div>Error: ${resp.status}</div>`)
      continue
    }
    document.getElementById("loading-ontologies").insertAdjacentHTML('beforeEnd', `<div>Reading ${key}...</div>`)
    ontology.graph = new OboGraphViz(await resp.json());
  }
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

function printIdsOfNodes(graph) {
  const httpIds = graph.all_edges().map((edge) => edge.subject_id())
  const ids = [...new Set(httpIds)].map(t => t.split("/").pop().replace("_", ":"))
  console.log(ids.join('\n'))
}

async function getGraph(termId, getParents, getChildren) {
  let ontologyName = termId.split(":")[0];

  const ogv = ONTOLOGY_DICT[ontologyName].graph;
  const newGraph = ogv.createBbopGraph();
  const termUrl = `http://purl.obolibrary.org/obo/${termId.replace(":", "_")}`;
  const graphs = [];
  if (getChildren) {
    graphs.push(newGraph.get_descendent_subgraph(termUrl));
    console.log('all Children ids')
    printIdsOfNodes(graphs[graphs.length - 1])
  }
  if (getParents) {
    graphs.push(newGraph.get_ancestor_subgraph(termUrl));
    console.log('all Parent ids')
    printIdsOfNodes(graphs[graphs.length - 1])
  }
  return mergeGraphs(graphs);
}

var mermaidText = "";

function editName(name) {
  // Introduce a <br> each 20 characters so that the text fits in the boxes of mermaid
  return name.replace(/(.{20})/g, "$1<br>");
}

function termWithLink(term, submittedIds) {
  // Edge case of owl:thing having no label
  if (!term.label) {
    return '<div>root</div>'
  }
  const termId = term.id.split("/").pop().replace("_", ":");

  let linkDict = {
    FYPO: "https://www.pombase.org/term/",
    GO: "https://www.ebi.ac.uk/QuickGO/term/",
    FBcv: "https://flybase.org/cgi-bin/cvreport.pl?id=",
  };
  let ontologyName = termId.split(":")[0];
  let text = `<a href=${linkDict[ontologyName]
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
      `      ${parent.id}["${termWithLink(parent, submittedIds)}"]-->|${r.type
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
    .value.replace(/\s/g, '').split(",");
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
  const maxTextSize = Number(document.getElementById("max-mermaid-size").value);
  console.log(maxTextSize)
  mermaid.initialize({ maxTextSize })
  mermaid.init();
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

function adjustGraphWidth(e) {
  const mermaidGraph = document.getElementById("mermaid");

  mermaidGraph.style.width = e.target.value + 'px'
}

function downloadGraph() {
  const element = document.getElementsByTagName("svg")[0];

  // Create a Blob with the HTML as its contents
  const blob = new Blob([element.outerHTML.replace(/<br>/g, "<br/>")], { type: "text/plain" });

  // Create a link element
  const a = document.createElement("a");

  // Set the href of the link to the URL of the Blob
  a.href = URL.createObjectURL(blob);

  // Set the download attribute of the link to the desired file name
  a.download = "graph.svg";

  // Click the link to trigger the download
  a.click();
}

window.onload = () => {
  document.getElementById("mermaid-map-width")
    .addEventListener("input", adjustGraphWidth);
  document
    .getElementById("copytext-button")
    .addEventListener("click", copyText);
  document
  // .getElementById("export-graph-button")
  // .addEventListener("click", downloadGraph);
  fetchOntologies().then(() => {
    document.getElementById("submit-button").removeAttribute("hidden");
    document.getElementById("loading-ontologies").textContent = 'Ontologies loaded!';
    document
      .getElementById("main-form")
      .addEventListener("submit", makePostRequest);
  });
};
