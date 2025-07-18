// --- API ABSTRACTION LAYER ---
// ** MODIFICA CHIAVE **
// Ora le chiamate usano percorsi relativi (es. '/api/resources') perché
// il frontend è servito dallo stesso server del backend.
const api = {
  fetchJSON: async (url, options = {}) => {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Errore sconosciuto" }));
      throw new Error(errorData.detail || "Errore del server");
    }
    if (response.status === 204) return null; // No Content
    return response.json();
  },
  getResources: () => api.fetchJSON("/api/resources"),
  getSkills: () => api.fetchJSON("/api/skills"),
  getBusinessUnits: () => api.fetchJSON("/api/business_units"),

  addBusinessUnit: (buData) =>
    api.fetchJSON("/api/business_units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buData),
    }),
  addResource: (resourceData) =>
    api.fetchJSON("/api/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resourceData),
    }),
  addSkill: (skillData) =>
    api.fetchJSON("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(skillData),
    }),
  updateResourceSkills: (resourceId, skills) =>
    api.fetchJSON(`/api/resources/${resourceId}/skills`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(skills),
    }),

  deleteResource: (resourceId) =>
    api.fetchJSON(`/api/resources/${resourceId}`, { method: "DELETE" }),
  deleteSkill: (skillId) =>
    api.fetchJSON(`/api/skills/${skillId}`, { method: "DELETE" }),
  deleteBusinessUnit: (buId, options) =>
    api.fetchJSON(`/api/business_units/${buId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    }),
};

// --- GESTIONE VISTE (TABS) ---
const views = document.querySelectorAll(".view-section");
const tabs = document.querySelectorAll(".tab-button");
let charts = {};

function switchView(viewId) {
  views.forEach((view) => view.classList.add("hidden"));
  tabs.forEach((tab) => tab.classList.remove("active"));

  document.getElementById(`view-${viewId}`).classList.remove("hidden");
  document.getElementById(`tab-${viewId}`).classList.add("active");

  switch (viewId) {
    case "risorse":
      renderRisorseView();
      break;
    case "skills":
      renderSkillsView();
      break;
    case "bu":
      renderBuView();
      break;
    case "assegna":
      renderAssegnaView();
      break;
    case "ricerca":
      renderRicercaView();
      break;
    case "statistiche":
      renderStatisticheView();
      break;
  }
  lucide.createIcons();
}

// --- FUNZIONI DI RENDERING (Invariate, ma ora usano la nuova 'api') ---
// (Il codice delle funzioni di rendering rimane lo stesso della versione precedente)
function renderRisorseView() {
  const container = document.getElementById("view-risorse");
  container.innerHTML = `
            <div class="grid md:grid-cols-3 gap-8">
                <div class="md:col-span-1">
                    <div class="bg-white p-6 rounded-lg shadow-md">
                        <h2 class="text-2xl font-semibold mb-4 flex items-center"><i data-lucide="user-plus" class="mr-2 text-blue-500"></i> Aggiungi Risorsa</h2>
                        <form id="form-add-resource" class="space-y-4">
                            <input type="text" id="resource-nome" placeholder="Nome" class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" required>
                            <input type="text" id="resource-cognome" placeholder="Cognome" class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" required>
                            <select id="resource-business_unit_id" class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" required><option value="">Seleziona Business Unit</option></select>
                            <input type="email" id="resource-email" placeholder="Email" class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" required>
                            <input type="tel" id="resource-numero" placeholder="Numero di telefono" class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500">
                            <button type="submit" class="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 flex items-center justify-center"><i data-lucide="save" class="mr-2"></i> Salva Risorsa</button>
                        </form>
                    </div>
                </div>
                <div class="md:col-span-2">
                    <div class="bg-white p-6 rounded-lg shadow-md">
                        <h2 class="text-2xl font-semibold mb-4 flex items-center"><i data-lucide="list" class="mr-2 text-blue-500"></i> Elenco Risorse</h2>
                        <div class="overflow-x-auto"><table class="min-w-full bg-white"><thead class="bg-gray-100"><tr><th class="py-2 px-4 text-left">Nome</th><th class="py-2 px-4 text-left">Business Unit</th><th class="py-2 px-4 text-left">Email</th><th class="py-2 px-4 text-center">Azioni</th></tr></thead><tbody id="resources-table-body"></tbody></table></div>
                    </div>
                </div>
            </div>`;

  document
    .getElementById("form-add-resource")
    .addEventListener("submit", handleAddResource);
  renderResourcesList();
  updateBuSelectors();
}

function renderSkillsView() {
  const container = document.getElementById("view-skills");
  container.innerHTML = `
            <div class="grid md:grid-cols-3 gap-8">
                <div class="md:col-span-1">
                    <div class="bg-white p-6 rounded-lg shadow-md">
                        <h2 class="text-2xl font-semibold mb-4 flex items-center"><i data-lucide="plus-circle" class="mr-2 text-green-500"></i> Aggiungi Skill</h2>
                        <form id="form-add-skill" class="space-y-4">
                            <input type="text" id="skill-name" placeholder="Nome della skill (es. React.js)" class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500" required>
                            <button type="submit" class="w-full bg-green-500 text-white font-bold py-2 px-4 rounded-md hover:bg-green-600 flex items-center justify-center"><i data-lucide="save" class="mr-2"></i> Aggiungi Skill</button>
                        </form>
                    </div>
                </div>
                <div class="md:col-span-2">
                     <div class="bg-white p-6 rounded-lg shadow-md">
                        <h2 class="text-2xl font-semibold mb-4 flex items-center"><i data-lucide="list-checks" class="mr-2 text-green-500"></i> Elenco Skills</h2>
                        <ul id="skills-list" class="space-y-2"></ul>
                    </div>
                </div>
            </div>`;

  document
    .getElementById("form-add-skill")
    .addEventListener("submit", handleAddSkill);
  renderSkillsList();
}

function renderBuView() {
  const container = document.getElementById("view-bu");
  container.innerHTML = `
            <div class="grid md:grid-cols-3 gap-8">
                <div class="md:col-span-1">
                    <div class="bg-white p-6 rounded-lg shadow-md">
                        <h2 class="text-2xl font-semibold mb-4 flex items-center"><i data-lucide="plus-circle" class="mr-2 text-orange-500"></i> Aggiungi Business Unit</h2>
                        <form id="form-add-bu" class="space-y-4">
                            <input type="text" id="bu-name" placeholder="Nome della Business Unit" class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500" required>
                            <button type="submit" class="w-full bg-orange-500 text-white font-bold py-2 px-4 rounded-md hover:bg-orange-600 flex items-center justify-center"><i data-lucide="save" class="mr-2"></i> Aggiungi BU</button>
                        </form>
                    </div>
                </div>
                <div class="md:col-span-2">
                     <div class="bg-white p-6 rounded-lg shadow-md">
                        <h2 class="text-2xl font-semibold mb-4 flex items-center"><i data-lucide="list-checks" class="mr-2 text-orange-500"></i> Elenco Business Units</h2>
                        <ul id="bu-list" class="space-y-2"></ul>
                    </div>
                </div>
            </div>`;

  document
    .getElementById("form-add-bu")
    .addEventListener("submit", handleAddBusinessUnit);
  renderBuList();
}

function renderAssegnaView() {
  const container = document.getElementById("view-assegna");
  container.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow-md">
                <h2 class="text-2xl font-semibold mb-4 flex items-center"><i data-lucide="user-check" class="mr-2 text-purple-500"></i> Assegna Competenze</h2>
                <div class="mb-6"><label for="select-resource-for-assignment" class="block text-sm font-medium text-gray-700 mb-1">Seleziona una risorsa:</label><select id="select-resource-for-assignment" class="w-full md:w-1/2 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500"></select></div>
                <div id="assignment-container" class="hidden">
                    <h3 class="text-xl font-semibold mb-4">Competenze per <span id="assignment-resource-name" class="text-purple-600"></span></h3>
                    <div id="assignment-skills-list" class="space-y-6"></div>
                    <button id="save-assignments-btn" class="mt-8 bg-purple-500 text-white font-bold py-2 px-6 rounded-md hover:bg-purple-600 flex items-center"><i data-lucide="save" class="mr-2"></i> Salva Assegnazioni</button>
                </div>
                <div id="assignment-placeholder" class="text-center py-12 text-gray-500"><i data-lucide="mouse-pointer-square" class="mx-auto h-12 w-12"></i><p class="mt-2">Seleziona una risorsa per iniziare.</p></div>
            </div>`;

  document
    .getElementById("select-resource-for-assignment")
    .addEventListener("change", handleResourceSelectionForAssignment);
  document
    .getElementById("save-assignments-btn")
    .addEventListener("click", handleSaveAssignments);
  updateResourceSelector();
}

function renderRicercaView() {
  const container = document.getElementById("view-ricerca");
  container.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow-md">
                <h2 class="text-2xl font-semibold mb-6 flex items-center"><i data-lucide="search-check" class="mr-2 text-cyan-500"></i> Cerca Risorse per Competenze</h2>
                <div class="grid md:grid-cols-3 gap-4 mb-6 p-4 border rounded-lg bg-gray-50">
                    <div>
                        <label for="search-skill-select" class="block text-sm font-medium text-gray-700">Competenza</label>
                        <select id="search-skill-select" class="mt-1 block w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-cyan-500 focus:border-transparent"></select>
                    </div>
                    <div>
                        <label for="search-level-slider" class="block text-sm font-medium text-gray-700">Livello Minimo: <span id="search-level-label" class="font-bold text-cyan-600">0</span></label>
                        <input type="range" id="search-level-slider" min="0" max="10" value="0" class="mt-1 block w-full">
                    </div>
                    <div>
                        <label for="search-bu-select" class="block text-sm font-medium text-gray-700">Business Unit</label>
                        <select id="search-bu-select" class="mt-1 block w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-cyan-500 focus:border-transparent">
                            <option value="">Tutte</option>
                        </select>
                    </div>
                </div>
                <div id="search-results-container"></div>
            </div>`;

  container
    .querySelector("#search-level-slider")
    .addEventListener("input", (e) => {
      container.querySelector("#search-level-label").textContent = parseInt(
        e.target.value,
        undefined
      );
      handleSearch();
    });
  container
    .querySelector("#search-skill-select")
    .addEventListener("change", handleSearch);
  container
    .querySelector("#search-bu-select")
    .addEventListener("change", handleSearch);

  updateSearchSkillSelector();
  updateBuSelectors();
  handleSearch();
}

function renderStatisticheView() {
  const container = document.getElementById("view-statistiche");
  container.innerHTML = `
            <div class="grid md:grid-cols-3 gap-6 mb-6">
                <div class="bg-white p-6 rounded-lg shadow-md text-center">
                    <h3 class="text-lg font-medium text-gray-500">Risorse Totali</h3>
                    <p id="stats-total-resources" class="text-5xl font-bold text-blue-600 mt-2">0</p>
                </div>
                <div class="bg-white p-6 rounded-lg shadow-md text-center">
                    <h3 class="text-lg font-medium text-gray-500">Skill Registrate</h3>
                    <p id="stats-total-skills" class="text-5xl font-bold text-green-600 mt-2">0</p>
                </div>
                <div class="bg-white p-6 rounded-lg shadow-md text-center">
                    <h3 class="text-lg font-medium text-gray-500">Competenza Media</h3>
                    <p id="stats-avg-level" class="text-5xl font-bold text-purple-600 mt-2">0.0</p>
                </div>
            </div>
            <div class="grid md:grid-cols-2 gap-6">
                <div class="bg-white p-6 rounded-lg shadow-md">
                    <h3 class="text-xl font-semibold mb-4 text-center">Top 5 Competenze più diffuse</h3>
                    <canvas id="top-skills-chart"></canvas>
                </div>
                <div class="bg-white p-6 rounded-lg shadow-md">
                    <h3 class="text-xl font-semibold mb-4 text-center">Risorse per Business Unit</h3>
                    <canvas id="bu-distribution-chart"></canvas>
                </div>
            </div>`;

  Promise.all([api.getResources(), api.getSkills()]).then(
    ([resources, skills]) => {
      document.getElementById("stats-total-resources").textContent =
        resources.length;
      document.getElementById("stats-total-skills").textContent = skills.length;
      const allLevels = resources.flatMap((r) => r.skills.map((s) => s.level));
      const avgLevel = allLevels.length
        ? (allLevels.reduce((a, b) => a + b, 0) / allLevels.length).toFixed(1)
        : "0.0";
      document.getElementById("stats-avg-level").textContent = avgLevel;

      if (charts.topSkills) charts.topSkills.destroy();
      if (charts.buDistribution) charts.buDistribution.destroy();

      const skillCounts = {};
      resources.forEach((r) =>
        r.skills.forEach((s) => {
          skillCounts[s.skill_id] = (skillCounts[s.skillId] || 0) + 1;
        })
      );
      const sortedSkills = Object.entries(skillCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);
      const skillNames = sortedSkills.map(
        ([skillId]) => skills.find((s) => s.id === parseInt(skillId))?.name || "N/D"
      );
      const skillValues = sortedSkills.map(([, count]) => count);

      charts.topSkills = new Chart(
        document.getElementById("top-skills-chart"),
        {
          type: "bar",
          data: {
            labels: skillNames,
            datasets: [
              {
                label: "Numero di Risorse",
                data: skillValues,
                backgroundColor: "rgba(54, 162, 235, 0.6)",
                borderColor: "rgba(54, 162, 235, 1)",
                borderWidth: 1,
              },
            ],
          },
          options: {
            indexAxis: "y",
            responsive: true,
            plugins: { legend: { display: false } },
          },
        }
      );

      const buCounts = resources.reduce((acc, r) => {
        acc[r.business_unit.name] = (acc[r.business_unit.name] || 0) + 1;
        return acc;
      }, {});
      charts.buDistribution = new Chart(
        document.getElementById("bu-distribution-chart"),
        {
          type: "doughnut",
          data: {
            labels: Object.keys(buCounts),
            datasets: [
              {
                data: Object.values(buCounts),
                backgroundColor: [
                  "#3b82f6",
                  "#10b981",
                  "#8b5cf6",
                  "#f97316",
                  "#ec4899",
                  "#f59e0b",
                  "#6366f1",
                ],
              },
            ],
          },
          options: {
            responsive: true,
            plugins: { legend: { position: "top" } },
          },
        }
      );
    }
  );
}

// Il resto del codice JavaScript (logica di gestione, utility, ecc.) rimane invariato.
// ... (omesso per brevità, ma è lo stesso della versione precedente) ...
async function renderResourcesList() {
  const resources = await api.getResources();
  const tableBody = document.getElementById("resources-table-body");
  tableBody.innerHTML = "";
  if (resources.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">Nessuna risorsa aggiunta.</td></tr>`;
    return;
  }
  resources.forEach((res) => {
    const row = document.createElement("tr");
    row.className = "border-b";
    row.innerHTML = `
                <td class="py-3 px-4">${res.nome} ${res.cognome}</td>
                <td class="py-3 px-4">${res.business_unit.name}</td>
                <td class="py-3 px-4">${res.email}</td>
                <td class="py-3 px-4 text-center">
                    <button onclick="confirmDelete('resource', '${res.id}', '${res.nome} ${res.cognome}')" class="text-red-500 hover:text-red-700"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                </td>`;
    tableBody.appendChild(row);
  });
  lucide.createIcons();
}

async function handleAddResource(e) {
  e.preventDefault();
  const formData = {
    nome: document.getElementById("resource-nome").value,
    cognome: document.getElementById("resource-cognome").value,
    business_unit_id: document.getElementById("resource-business_unit_id").value,
    email: document.getElementById("resource-email").value,
    numero: document.getElementById("resource-numero").value,
  };
  if (!formData.business_unit_id) {
    showNotification("Per favore, seleziona una Business Unit.", "warning");
    return;
  }
  await api.addResource(formData);
  renderResourcesList();
  updateResourceSelector();
  e.target.reset();
  showNotification("Risorsa aggiunta con successo!", "success");
}

async function renderSkillsList() {
  const skills = await api.getSkills();
  const list = document.getElementById("skills-list");
  list.innerHTML = "";
  if (skills.length === 0) {
    list.innerHTML = `<li class="text-center py-4 text-gray-500">Nessuna skill aggiunta.</li>`;
    return;
  }
  skills.forEach((skill) => {
    const item = document.createElement("li");
    item.className =
      "flex justify-between items-center bg-gray-50 p-3 rounded-md";
    item.innerHTML = `
                <div><span class="font-medium">${skill.name}</span><span class="text-xs text-gray-400 ml-2">ID: ${skill.id}</span></div>
                <button onclick="confirmDelete('skill', '${skill.id}', '${skill.name}')" class="text-red-500 hover:text-red-700"><i data-lucide="trash-2" class="w-5 h-5"></i></button>`;
    list.appendChild(item);
  });
  lucide.createIcons();
}

async function handleAddSkill(e) {
  e.preventDefault();
  const skillName = document.getElementById("skill-name").value;
  try {
    await api.addSkill({ name: skillName });
    renderSkillsList();
    e.target.reset();
    showNotification("Skill aggiunta con successo!", "success");
  } catch (error) {
    showNotification(error.message, "error");
  }
}

async function renderBuList() {
  const businessUnits = await api.getBusinessUnits();
  const list = document.getElementById("bu-list");
  list.innerHTML = "";
  if (businessUnits.length === 0) {
    list.innerHTML = `<li class="text-center py-4 text-gray-500">Nessuna Business Unit aggiunta.</li>`;
    return;
  }
  businessUnits.forEach((bu) => {
    const item = document.createElement("li");
    item.className =
      "flex justify-between items-center bg-gray-50 p-3 rounded-md";
    item.innerHTML = `
                <div><span class="font-medium">${bu.name}</span><span class="text-xs text-gray-400 ml-2">ID: ${bu.id}</span></div>
                <button onclick="confirmDelete('bu', '${bu.id}', '${bu.name}')" class="text-red-500 hover:text-red-700"><i data-lucide="trash-2" class="w-5 h-5"></i></button>`;
    list.appendChild(item);
  });
  lucide.createIcons();
}

async function handleAddBusinessUnit(e) {
  e.preventDefault();
  const buName = document.getElementById("bu-name").value;
  try {
    await api.addBusinessUnit({ name: buName });
    renderBuList();
    updateBuSelectors();
    e.target.reset();
    showNotification("Business Unit aggiunta con successo!", "success");
  } catch (error) {
    showNotification(error.message, "error");
  }
}

async function updateResourceSelector() {
  const selector = document.getElementById("select-resource-for-assignment");
  if (!selector) return;
  const resources = await api.getResources();
  const selectedValue = selector.value;
  selector.innerHTML = '<option value="">-- Seleziona una risorsa --</option>';
  resources.forEach((res) => {
    const option = document.createElement("option");
    option.value = res.id;
    option.textContent = `${res.nome} ${res.cognome} (${res.business_unit.name})`;
    selector.appendChild(option);
  });
  selector.value = selectedValue;
}

function handleResourceSelectionForAssignment(e) {
  const resourceId = parseInt(e.target.value, undefined);
  const container = document.getElementById("assignment-container");
  const placeholder = document.getElementById("assignment-placeholder");
  if (resourceId) {
    renderAssignmentsForResource(resourceId);
    container.classList.remove("hidden");
    placeholder.classList.add("hidden");
  } else {
    container.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }
}

async function renderAssignmentsForResource(resourceId) {
  const [resource, allSkills] = await Promise.all([
    api
      .getResources()
      .then((resources) => resources.find((r) => r.id === resourceId)),
    api.getSkills(),
  ]);
  if (!resource) return;

  document.getElementById(
    "assignment-resource-name"
  ).textContent = `${resource.nome} ${resource.cognome}`;
  const listContainer = document.getElementById("assignment-skills-list");
  listContainer.innerHTML = "";

  allSkills.forEach((skill) => {
    const assignedSkill = resource.skills.find((s) => s.skill_id === skill.id);
    const currentLevel = assignedSkill ? assignedSkill.level : 0;
    const skillDiv = document.createElement("div");
    skillDiv.className = "grid grid-cols-1 md:grid-cols-3 items-center gap-4";
    skillDiv.innerHTML = `
                <label for="slider-${skill.id}" class="font-medium col-span-1">${skill.name}</label>
                <div class="col-span-2 flex items-center gap-4">
                    <input type="range" id="slider-${skill.id}" data-skill-id="${skill.id}" min="0" max="10" value="${currentLevel}" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer">
                    <span class="font-bold text-purple-600 w-8 text-center" id="level-label-${skill.id}">${currentLevel}</span>
                </div>`;
    listContainer.appendChild(skillDiv);
  });

  listContainer.querySelectorAll('input[type="range"]').forEach((slider) => {
    slider.addEventListener("input", (e) => {
      document.getElementById(
        `level-label-${e.target.dataset.skillId}`
      ).textContent = e.target.value;
    });
  });
}

async function handleSaveAssignments() {
  const resourceId = parseInt(
    document.getElementById("select-resource-for-assignment").value,
    undefined
  );
  if (!resourceId) {
    showNotification("Seleziona una risorsa prima di salvare.", "warning");
    return;
  }
  const newAssignments = [];
  document
    .getElementById("assignment-skills-list")
    .querySelectorAll('input[type="range"]')
    .forEach((slider) => {
      const level = parseInt(slider.value, 0);
      if (level > 0) {
        newAssignments.push({ skill_id: slider.dataset.skillId, level });
      }
    });
  const resource = await api.updateResourceSkills(resourceId, newAssignments);
  showNotification(`Competenze per ${resource.nome} aggiornate!`, "success");
}

async function updateSearchSkillSelector() {
  const selector = document.getElementById("search-skill-select");
  const skills = await api.getSkills();
  selector.innerHTML = '<option value="">Tutte le skill</option>';
  skills.forEach((skill) => {
    const option = document.createElement("option");
    option.value = skill.id;
    option.textContent = skill.name;
    selector.appendChild(option);
  });
}

async function handleSearch() {
  const skillId = document.getElementById("search-skill-select").value;
  const minLevel = document.getElementById("search-level-slider").value;
  const bu = document.getElementById("search-bu-select").value;
  const container = document.getElementById("search-results-container");

  const [resources, allSkills] = await Promise.all([
    api.getResources(),
    api.getSkills(),
  ]);

  const filteredResources = resources.filter((resource) => {
    const buMatch = !bu || resource.business_unit.id === parseInt(bu);
    const skillMatch =
      !skillId ||
      resource.skills.some((s) => s.skill_id === parseInt(skillId) && s.level >= minLevel);
    return buMatch && skillMatch;
  });

  container.innerHTML = "";
  if (filteredResources.length === 0) {
    container.innerHTML = `<div class="text-center py-12 text-gray-500"><i data-lucide="search-x" class="mx-auto h-12 w-12"></i><p class="mt-2">Nessun risultato trovato.</p></div>`;
    lucide.createIcons();
    return;
  }

  const resultsList = document.createElement("div");
  resultsList.className = "space-y-4";
  filteredResources.forEach((res) => {
    const card = document.createElement("div");
    card.className = "p-4 border rounded-lg bg-white shadow-sm";
    let skillsHtml = res.skills
      .map((s) => {
        const skillInfo = allSkills.find((as) => as.id === s.skillId);
        var skillName = s.name || skillInfo?.name || "Sconosciuta";
        return `<span class="inline-block bg-gray-200 rounded-full px-3 py-1 text-sm font-semibold text-gray-700 mr-2 mb-2">${skillName} <span class="font-bold text-blue-600">${s.level}</span></span>`;
      })
      .join("");
    if (!skillsHtml)
      skillsHtml =
        '<p class="text-sm text-gray-500">Nessuna competenza assegnata.</p>';

    card.innerHTML = `<div class="flex justify-between items-center"><div><h4 class="text-lg font-bold">${res.nome} ${res.cognome}</h4><p class="text-sm text-gray-600">${res.email} | ${res.business_unit.name}</p></div></div><div class="mt-4">${skillsHtml}</div>`;
    resultsList.appendChild(card);
  });
  container.appendChild(resultsList);
}

async function updateBuSelectors() {
  const businessUnits = await api.getBusinessUnits();
  const selectors = [
    document.getElementById("resource-business_unit_id"),
    document.getElementById("search-bu-select"),
  ];
  selectors.forEach((selector) => {
    if (!selector) return;
    const currentValue = selector.value;
    const firstOption = selector.options[0];
    selector.innerHTML = "";
    if (firstOption) selector.appendChild(firstOption.cloneNode(true));
    businessUnits.forEach((bu) => {
      const option = document.createElement("option");
      option.value = bu.id;
      option.textContent = bu.name;
      selector.appendChild(option);
    });
    selector.value = currentValue;
  });
}

function showNotification(message, type = "success") {
  const modal = document.getElementById("notification-modal");
  const msg = document.getElementById("notification-message");
  const iconContainer = document.getElementById("notification-icon");
  msg.textContent = message;
  iconContainer.innerHTML = "";
  let icon, bgColor, iconColor;
  switch (type) {
    case "success":
      icon = "check";
      bgColor = "bg-green-100";
      iconColor = "text-green-600";
      break;
    case "warning":
      icon = "alert-triangle";
      bgColor = "bg-yellow-100";
      iconColor = "text-yellow-600";
      break;
    case "error":
      icon = "x-circle";
      bgColor = "bg-red-100";
      iconColor = "text-red-600";
      break;
  }
  iconContainer.className = `mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center ${bgColor}`;
  const iconElement = document.createElement("i");
  iconElement.setAttribute("data-lucide", icon);
  iconElement.className = iconColor;
  iconContainer.appendChild(iconElement);
  lucide.createIcons();
  modal.classList.remove("hidden");
  setTimeout(() => modal.classList.add("hidden"), 2500);
}

const confirmDeleteModal = document.getElementById("confirm-delete-modal");
const buDeleteModal = document.getElementById("bu-delete-modal");

async function confirmDelete(type, id, name) {
  if (type === "bu") {
    const resourcesInBu = (await api.getResources()).filter(
      (r) => r.bu === name
    );
    if (resourcesInBu.length > 0) {
      const buDeleteName = document.getElementById("bu-delete-name");
      buDeleteName.textContent = name;
      const targetSelect = document.getElementById("bu-migrate-target-select");
      const otherBus = (await api.getBusinessUnits()).filter(
        (bu) => bu.id !== id
      );

      targetSelect.innerHTML = "";
      if (otherBus.length === 0) {
        document.getElementById("bu-delete-option-migrate").disabled = true;
        document.getElementById("bu-delete-option-delete").checked = true;
        targetSelect.innerHTML =
          "<option>Nessuna altra BU disponibile</option>";
        targetSelect.disabled = true;
      } else {
        document.getElementById("bu-delete-option-migrate").disabled = false;
        document.getElementById("bu-delete-option-migrate").checked = true;
        targetSelect.disabled = false;
        otherBus.forEach((bu) => {
          const option = document.createElement("option");
          option.value = bu.id;
          option.textContent = bu.name;
          targetSelect.appendChild(option);
        });
      }

      buDeleteModal.classList.remove("hidden");
      document.getElementById("confirm-bu-delete-btn").onclick = () =>
        executeBuDelete(id);
      document.getElementById("cancel-bu-delete-btn").onclick = () =>
        buDeleteModal.classList.add("hidden");
      return;
    }
  }

  const message = document.getElementById("confirm-delete-message");
  message.innerHTML = `Sei sicuro di voler eliminare <strong>${name}</strong>? L'azione è irreversibile.`;
  confirmDeleteModal.classList.remove("hidden");
  document.getElementById("confirm-delete-btn").onclick = () =>
    executeDelete(type, id);
  document.getElementById("cancel-delete-btn").onclick = () =>
    confirmDeleteModal.classList.add("hidden");
}

async function executeDelete(type, id) {
  try {
    switch (type) {
      case "resource":
        await api.deleteResource(id);
        renderResourcesList();
        break;
      case "skill":
        await api.deleteSkill(id);
        renderSkillsList();
        break;
      case "bu":
        await api.deleteBusinessUnit(id, { action: "delete" });
        renderBuList();
        updateBuSelectors();
        break;
    }
    confirmDeleteModal.classList.add("hidden");
    showNotification("Elemento eliminato con successo!", "success");
  } catch (error) {
    showNotification(error.message, "error");
  }
}

async function executeBuDelete(buId) {
  try {
    const action = document.querySelector(
      'input[name="bu-delete-option"]:checked'
    ).value;
    const options = { action };
    if (action === "migrate") {
      options.targetBuId = document.getElementById(
        "bu-migrate-target-select"
      ).value;
      if (!options.targetBuId) {
        showNotification(
          "Seleziona una Business Unit di destinazione.",
          "warning"
        );
        return;
      }
    }

    await api.deleteBusinessUnit(buId, options);
    buDeleteModal.classList.add("hidden");
    showNotification("Business Unit eliminata con successo!", "success");

    renderBuList();
    renderResourcesList();
    updateBuSelectors();
    updateResourceSelector();
  } catch (error) {
    showNotification(error.message, "error");
  }
}

window.onload = () => {
  switchView("risorse");
  lucide.createIcons();
};
