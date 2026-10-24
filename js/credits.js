// Everything LeafKin uses that someone else made, with its licence. Shown in Settings → Credits & licences;
// CREDITS.md in the repo has the same list. Keep both in step when adding a dataset or library.
export const CREDITS = [
  {
    title: "Photo health check: training data",
    note: "The model is trained on these photo collections (the photos themselves aren't in the app). Changes: photos resized, labels grouped into symptoms.",
    items: [
      { name: "Aloe Vera Leaf Disease Detection Dataset", by: "Khan, Reza, Mojumdar et al.", where: "Mendeley Data", url: "https://doi.org/10.17632/7w6t4zx33n.1", licence: "CC BY 4.0" },
      { name: "Cactus dataset", by: "Benali & Jdey", where: "Mendeley Data", url: "https://doi.org/10.17632/jgt7ghdmg5.1", licence: "CC BY 4.0" },
      { name: "Indoor Plant Disease Image Dataset", by: "Mahmud Opu, Islam, Abdullah & Akter (ICCIT 2025)", where: "combined on Kaggle by Abdul Ahad", url: "https://www.kaggle.com/datasets/abdulahad46/indoor-plant-disease-detection-dataset", licence: "CC BY 4.0" },
      { name: "PlantDoc", by: "Singh, Jain, Jain, Kayal, Kumawat & Batra (2020)", where: "GitHub", url: "https://github.com/pratikkayal/PlantDoc-Dataset", licence: "CC BY 4.0" },
    ],
  },
  {
    title: "Photo health check: software and model",
    items: [
      { name: "MobileNetV2 (ImageNet weights)", by: "ONNX Model Zoo", url: "https://github.com/onnx/models", licence: "Apache 2.0" },
      { name: "ONNX Runtime Web", by: "Microsoft", url: "https://github.com/microsoft/onnxruntime", licence: "MIT" },
    ],
  },
  {
    title: "Plant identification",
    items: [
      { name: "Pl@ntNet API", by: "Pl@ntNet", url: "https://my.plantnet.org", licence: "service",
        note: "The image-based plant species identification service used is based on the Pl@ntNet recognition API, regularly updated and accessible through the site https://my.plantnet.org/" },
    ],
  },
  {
    title: "App",
    items: [
      { name: "supabase-js", by: "Supabase", url: "https://github.com/supabase/supabase-js", licence: "MIT" },
      { name: "Bricolage Grotesque", by: "The Bricolage Grotesque Project Authors", url: "https://github.com/ateliertriay/bricolage", licence: "SIL OFL 1.1" },
      { name: "Atkinson Hyperlegible", by: "Braille Institute of America", url: "https://www.brailleinstitute.org/freefont/", licence: "SIL OFL 1.1" },
      { name: "JetBrains Mono", by: "The JetBrains Mono Project Authors", url: "https://github.com/JetBrains/JetBrainsMono", licence: "SIL OFL 1.1" },
    ],
  },
];

const LICENCE_URL = {
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "Apache 2.0": "https://www.apache.org/licenses/LICENSE-2.0",
  "MIT": "https://opensource.org/license/mit",
  "SIL OFL 1.1": "https://openfontlicense.org",
};

export function creditsHtml(esc) {
  const a = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`;
  return CREDITS.map((g) => `
    <h3>${esc(g.title)}</h3>
    ${g.note ? `<p class="hint">${esc(g.note)}</p>` : ""}
    <ul class="credits">${g.items.map((x) => `<li>${a(x.url, x.name)}, ${esc(x.by)}${x.where ? ` (${esc(x.where)})` : ""}.
      ${LICENCE_URL[x.licence] ? a(LICENCE_URL[x.licence], x.licence) : ""}${x.note ? `<br><span class="hint">${esc(x.note)}</span>` : ""}</li>`).join("")}</ul>`).join("");
}
