// --- LOGGING LAYER ---
const logger = {
  debug: (message, ...args) => console.debug('[DEBUG]', message, ...args),
  info: (message, ...args) => console.log('[INFO]', message, ...args),
  warn: (message, ...args) => console.warn('[WARN]', message, ...args),
  error: (message, ...args) => console.error('[ERROR]', message, ...args)
};

// --- AUTHENTICATION LAYER ---
const auth = {
  getToken: () => localStorage.getItem('access_token'),
  getUserInfo: () => {
    const userInfo = localStorage.getItem('user_info');
    return userInfo ? JSON.parse(userInfo) : null;
  },
  isAuthenticated: () => !!auth.getToken(),
  logout: () => {
    const idToken = localStorage.getItem('id_token');
    logger.info('🚪 Logout richiesto. Pulizia dati locali...');
    
    // Pulisce i dati dal localStorage
    localStorage.removeItem('access_token');
    localStorage.removeItem('id_token');
    localStorage.removeItem('user_info');
    
    // Reindirizza all'endpoint di logout del backend, che gestirà il redirect a Authentik
    // Passiamo l'id_token come "hint" per invalidare la sessione corretta
    const logoutUrl = `/auth/perform_logout?id_token_hint=${encodeURIComponent(idToken || '')}`;
    logger.info(`🚀 Reindirizzamento a ${logoutUrl} per il logout...`);
    window.location.href = logoutUrl;
  },
  checkAuth: async () => {
    // Controlla se l'autenticazione è abilitata
    try {
      const config = await fetch('/auth/config').then(r => r.json());
      if (!config.oidc_enabled) {
        return true; // Modalità dev
      }
      
      if (!auth.isAuthenticated()) {
        window.location.href = '/auth/login';
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Errore controllo autenticazione:', error);
      return false;
    }
  }
};

// --- API ABSTRACTION LAYER ---
const api = {
  fetchJSON: async (url, options = {}) => {
    // Aggiungi il token di autenticazione se disponibile
    const token = auth.getToken();
    if (token) {
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      };
    }
    
    const response = await fetch(url, options);
    
    // Se non autenticato, redirect al login
    if (response.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('id_token');
      localStorage.removeItem('user_info');
      window.location.href = '/auth/login';
      return;
    }
    
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Errore sconosciuto" }));
      throw new Error(errorData.detail || "Errore del server");
    }
    if (response.status === 204) return null;
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

  addLabelToSkill: (skillId, label) =>
    api.fetchJSON(`/api/skills/${skillId}/labels/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    }),

  removeLabelFromSkill: (skillId, label) =>
    api.fetchJSON(`/api/skills/${skillId}/labels/remove`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
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
  // Verifica se l'utente ha i permessi per accedere alla vista richiesta
  const adminOnlyViews = ['risorse', 'skills', 'bu', 'assegna'];
  const isAdmin = document.body.classList.contains('user-admin');
  
  // Se l'utente non è admin e sta tentando di accedere a una vista riservata
  if (adminOnlyViews.includes(viewId) && !isAdmin) {
    logger.warning(`Accesso negato alla vista ${viewId} - utente non admin`);
    // Reindirizza alla ricerca
    viewId = 'ricerca';
    showNotification('Accesso limitato: puoi accedere solo a Ricerca e Statistiche', 'warning');
  }
  
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
      loadSkillsWithLabels(); // Ancora utile per popolare allSkillsWithLabels
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

// --- FUNZIONI DI RENDERING ---
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
                            <select type="text" id="resource-business_unit_id" class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500" required><option value="">Seleziona Business Unit</option></select>
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
                            <input type="text" id="skill-labels" placeholder="Labels (es. frontend, web, js)" class="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500">
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

let allSkillsWithLabels = []; // Variabile globale per tutte le skill con le loro label

async function renderAssegnaView() {
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
  await loadAllSkillsForAssignment(); // Carica tutte le skill con le loro label
  updateResourceSelector();
}

async function loadAllSkillsForAssignment() {
    try {
        allSkillsWithLabels = await api.getSkills();
    } catch (error) {
        showNotification(`Errore nel caricamento delle skill: ${error.message}`, "error");
    }
}

function renderRicercaView() {
  const container = document.getElementById("view-ricerca");
  container.innerHTML = `
            <div class="bg-white p-6 rounded-lg shadow-md">
                <h2 class="text-2xl font-semibold mb-6 flex items-center">
                    <i data-lucide="search-check" class="mr-2 text-cyan-500"></i> 
                    Cerca Risorse per Competenze
                </h2>
                
                <!-- Pannello di filtro migliorato -->
                <div class="bg-gradient-to-r from-cyan-50 to-blue-50 p-6 rounded-xl border border-cyan-200 mb-8">
                    <div class="flex items-center mb-4">
                        <i data-lucide="filter" class="w-5 h-5 mr-2 text-cyan-600"></i>
                        <h3 class="text-lg font-semibold text-cyan-800">Filtri di Ricerca</h3>
                    </div>
                    
                    <div class="grid md:grid-cols-3 gap-6">
                        <div class="space-y-2">
                            <label for="search-skill-select" class="flex items-center text-sm font-medium text-gray-700">
                                <i data-lucide="cpu" class="w-4 h-4 mr-2 text-cyan-600"></i>
                                Competenza
                            </label>
                            <select id="search-skill-select" class="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white shadow-sm">
                                <option value="">🔍 Tutte le competenze</option>
                            </select>
                        </div>
                        
                        <div class="space-y-2">
                            <label for="search-level-slider" class="flex items-center text-sm font-medium text-gray-700">
                                <i data-lucide="trending-up" class="w-4 h-4 mr-2 text-cyan-600"></i>
                                Livello Minimo: 
                                <span id="search-level-label" class="ml-2 px-2 py-1 bg-cyan-100 text-cyan-800 rounded-full text-xs font-bold">0</span>
                            </label>
                            <div class="relative">
                                <input type="range" id="search-level-slider" min="0" max="10" value="0" 
                                       class="block w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider">
                                <div class="flex justify-between text-xs text-gray-500 mt-1">
                                    <span>0</span>
                                    <span>5</span>
                                    <span>10</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="space-y-2">
                            <label for="search-bu-select" class="flex items-center text-sm font-medium text-gray-700">
                                <i data-lucide="building" class="w-4 h-4 mr-2 text-cyan-600"></i>
                                Business Unit
                            </label>
                            <select id="search-bu-select" class="block w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white shadow-sm">
                                <option value="">🏢 Tutte le Business Unit</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- Indicatore risultati -->
                    <div class="mt-4 p-3 bg-white rounded-lg border border-cyan-200">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center text-sm text-gray-600">
                                <i data-lucide="users" class="w-4 h-4 mr-2"></i>
                                <span id="search-results-count">Pronto per la ricerca</span>
                            </div>
                            <button id="clear-filters-btn" class="text-xs text-cyan-600 hover:text-cyan-800 flex items-center">
                                <i data-lucide="refresh-cw" class="w-3 h-3 mr-1"></i>
                                Azzera filtri
                            </button>
                        </div>
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
  
  // Aggiungi evento per il pulsante azzera filtri
  container
    .querySelector("#clear-filters-btn")
    .addEventListener("click", () => {
      document.getElementById("search-skill-select").value = "";
      document.getElementById("search-level-slider").value = "0";
      document.getElementById("search-bu-select").value = "";
      container.querySelector("#search-level-label").textContent = "0";
      handleSearch();
    });

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
                    <p id="total-resources" class="text-4xl font-bold text-blue-600 mt-2">0</p>
                </div>
                <div class="bg-white p-6 rounded-lg shadow-md text-center">
                    <h3 class="text-lg font-medium text-gray-500">Skills Registrate</h3>
                    <p id="total-skills" class="text-4xl font-bold text-green-600 mt-2">0</p>
                </div>
                <div class="bg-white p-6 rounded-lg shadow-md text-center">
                    <h3 class="text-lg font-medium text-gray-500">Business Unit</h3>
                    <p id="total-bu" class="text-4xl font-bold text-orange-600 mt-2">0</p>
                </div>
            </div>

            <div class="grid md:grid-cols-2 gap-6">
                <div class="bg-white p-6 rounded-lg shadow-md">
                    <h3 class="text-xl font-semibold mb-4 flex items-center"><i data-lucide="bar-chart-2" class="mr-2 text-blue-500"></i> Top 5 Skills</h3>
                    <canvas id="top-skills-chart"></canvas>
                </div>
                <div class="bg-white p-6 rounded-lg shadow-md">
                    <h3 class="text-xl font-semibold mb-4 flex items-center"><i data-lucide="pie-chart" class="mr-2 text-orange-500"></i> Distribuzione per Business Unit</h3>
                    <canvas id="bu-distribution-chart"></canvas>
                </div>
            </div>`;
  loadStats();
}

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
    row.className = "border-b last:border-0";
    row.innerHTML = `
            <td class="py-2 px-4">${res.nome} ${res.cognome}</td>
            <td class="py-2 px-4">${res.business_unit.name}</td>
            <td class="py-2 px-4">${res.email}</td>
            <td class="py-2 px-4 text-center">
                <button onclick="confirmDelete('resource', ${res.id}, '${res.nome} ${res.cognome}')" class="text-red-500 hover:text-red-700">
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                </button>
            </td>
        `;
    tableBody.appendChild(row);
  });
  lucide.createIcons();
}

async function handleAddResource(e) {
  e.preventDefault();
  const nome = document.getElementById("resource-nome").value;
  const cognome = document.getElementById("resource-cognome").value;
  const email = document.getElementById("resource-email").value;
  const numero = document.getElementById("resource-numero").value;
  const business_unit_id = document.getElementById(
    "resource-business_unit_id"
  ).value;

  try {
    await api.addResource({
      nome,
      cognome,
      email,
      numero: numero || null,
      business_unit_id: parseInt(business_unit_id, 10),
    });
    renderResourcesList();
    e.target.reset();
    showNotification("Risorsa aggiunta con successo!", "success");
  } catch (error) {
    showNotification(error.message, "error");
  }
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
    item.className = "flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50 p-3 rounded-md mb-2";
    
    const labelsHtml = skill.labels.map(label => `
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2 mb-1">
                ${label}
                <button type="button" onclick="removeLabel('${skill.id}', '${label}')" class="-mr-0.5 ml-1 h-3 w-3 rounded-full inline-flex items-center justify-center text-blue-400 hover:bg-blue-200 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 text-sm">×</button>
            </span>
        `).join("");

    item.innerHTML = `
            <div class="mb-2 md:mb-0 md:flex-1">
                <span class="font-medium text-lg">${skill.name}</span>
                <span class="text-xs text-gray-400 ml-2">ID: ${skill.id}</span>
                <div class="mt-1 flex flex-wrap">${labelsHtml}</div>
            </div>
            <div class="flex items-center space-x-2 w-full md:w-auto mt-2 md:mt-0">
                <input type="text" id="new-label-input-${skill.id}" placeholder="Nuova label" class="flex-grow p-1 border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 text-sm">
                <button onclick="addLabelToSkill(${skill.id})" class="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm flex items-center">
                    <i data-lucide="plus" class="w-4 h-4 mr-1"></i> Add
                </button>
                <button onclick="confirmDelete('skill', ${skill.id}, '${skill.name}')" class="text-red-500 hover:text-red-700 p-1">
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                </button>
            </div>
        `;
    list.appendChild(item);

    // Add event listener for 'Enter' key on the new label input
    const newLabelInput = document.getElementById(`new-label-input-${skill.id}`);
    newLabelInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent form submission
            addLabelToSkill(skill.id);
        }
    });
  });
  lucide.createIcons();
}


async function handleAddSkill(e) {
  e.preventDefault();
  const skillName = document.getElementById("skill-name").value;
  const skillLabelsInput = document.getElementById("skill-labels").value;
  const skillLabels = skillLabelsInput.split(',').map(label => label.trim()).filter(label => label !== '');

  try {
    await api.addSkill({ name: skillName, labels: skillLabels });
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
    item.className = "flex justify-between items-center bg-gray-50 p-3 rounded-md";
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
  selector.value = selectedValue; // Restore selected value
  if (selectedValue) {
    handleResourceSelectionForAssignment();
  }
}

async function updateBuSelectors() {
  const selectors = document.querySelectorAll(
    "#resource-business_unit_id, #search-bu-select, #bu-migrate-target-select"
  );
  const businessUnits = await api.getBusinessUnits();

  selectors.forEach((selector) => {
    const selectedValue = selector.value;
    Array.from(selector.options).forEach((option) => {
      if (option.value !== "" && option.value !== "all") {
        selector.removeChild(option);
      }
    });

    businessUnits.forEach((bu) => {
      const option = document.createElement("option");
      option.value = bu.id;
      option.textContent = bu.name;
      selector.appendChild(option);
    });
    selector.value = selectedValue;
  });
}

async function handleResourceSelectionForAssignment() {
  const resourceId = document.getElementById("select-resource-for-assignment").value;
  const assignmentContainer = document.getElementById("assignment-container");
  const assignmentPlaceholder = document.getElementById("assignment-placeholder");
  const resourceNameSpan = document.getElementById("assignment-resource-name");
  const skillsListContainer = document.getElementById("assignment-skills-list");

  if (!resourceId) {
    assignmentContainer.classList.add("hidden");
    assignmentPlaceholder.classList.remove("hidden");
    skillsListContainer.innerHTML = "";
    return;
  }

  try {
    const resource = await api.fetchJSON(`/api/resources/${resourceId}`);
    resourceNameSpan.textContent = `${resource.nome} ${resource.cognome}`;
    assignmentContainer.classList.remove("hidden");
    assignmentPlaceholder.classList.add("hidden");
    populateAssignmentSkills(resource);
  } catch (error) {
    showNotification(`Errore nel caricamento delle competenze: ${error.message}`, "error");
    assignmentContainer.classList.add("hidden");
    assignmentPlaceholder.classList.remove("hidden");
  }
}

async function populateAssignmentSkills(resource) {
  const skillsListContainer = document.getElementById("assignment-skills-list");
  skillsListContainer.innerHTML = "";

  allSkillsWithLabels.forEach((skill) => {
    const assignedSkill = resource.skills.find((s) => s.skill_id === skill.id);
    const currentLevel = assignedSkill ? assignedSkill.level : 0;
    const currentAssignedLabels = assignedSkill ? assignedSkill.labels : [];

    const skillSpecificLabels = skill.labels || []; // Labels from the skill definition

    const skillItem = document.createElement("div");
    skillItem.className = "p-4 border border-gray-200 rounded-md bg-gray-50";
    skillItem.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="font-semibold text-lg">${skill.name}</span>
                <span class="text-gray-600">ID: ${skill.id}</span>
            </div>
            <div class="mb-3">
                <label for="level-slider-${skill.id}" class="block text-sm font-medium text-gray-700">Livello: <span id="level-label-${skill.id}" class="font-bold text-purple-600">${currentLevel}</span></label>
                <input
                    type="range"
                    id="level-slider-${skill.id}"
                    min="0"
                    max="10"
                    value="${currentLevel}"
                    data-skill-id="${skill.id}"
                    class="mt-1 block w-full"
                >
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Labels disponibili:</label>
                <div class="flex flex-wrap gap-2 mb-2" id="labels-checklist-${skill.id}">
                    ${skillSpecificLabels.map(label => `
                        <label class="inline-flex items-center">
                            <input type="checkbox" value="${label}" class="form-checkbox h-4 w-4 text-purple-600"
                                ${currentAssignedLabels.includes(label) ? 'checked' : ''}
                                data-skill-id="${skill.id}"
                            >
                            <span class="ml-1 text-sm text-gray-700">${label}</span>
                        </label>
                    `).join('')}
                    ${skillSpecificLabels.length === 0 ? '<span class="text-sm text-gray-500">Nessuna label predefinita per questa skill.</span>' : ''}
                </div>
            </div>
        `;
    skillsListContainer.appendChild(skillItem);

    const slider = skillItem.querySelector(`#level-slider-${skill.id}`);
    slider.addEventListener("input", (e) => {
      const level = parseInt(e.target.value, 10);
      skillItem.querySelector(`#level-label-${skill.id}`).textContent = level;
    });
  });

  lucide.createIcons();
}

async function handleSaveAssignments() {
  const resourceId = document.getElementById("select-resource-for-assignment").value;
  if (!resourceId) {
    showNotification("Seleziona una risorsa prima di salvare!", "error");
    return;
  }

  const newAssignments = [];
  document
    .getElementById("assignment-skills-list")
    .querySelectorAll('input[type="range"]')
    .forEach((slider) => {
      const level = parseInt(slider.value, 10);
      const skillId = parseInt(slider.dataset.skillId, 10);
      
      const skillLabels = new Set();
      // Only collect labels from checked checkboxes (predefined labels)
      document.querySelectorAll(`#labels-checklist-${skillId} input[type="checkbox"]:checked`)
          .forEach(checkbox => skillLabels.add(checkbox.value));
      
      const labelsArray = Array.from(skillLabels);

      if (level > 0 || labelsArray.length > 0) {
        newAssignments.push({
          skill_id: skillId,
          level: level,
          labels: labelsArray
        });
      }
    });

  try {
    const resource = await api.updateResourceSkills(resourceId, newAssignments);
    showNotification(`Competenze per ${resource.nome} aggiornate!`, "success");
    handleResourceSelectionForAssignment();
  } catch (error) {
    showNotification(error.message, "error");
  }
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
  const resultsCounter = document.getElementById("search-results-count");
  
  const [resources, allSkills] = await Promise.all([
    api.getResources(),
    api.getSkills(),
  ]);

  const filteredResources = resources.filter((resource) => {
    const buMatch = !bu || resource.business_unit.id === parseInt(bu, 10);
    const skillMatch =
      !skillId ||
      resource.skills.some(
        (s) => s.skill_id === parseInt(skillId, 10) && s.level >= minLevel
      );
    return buMatch && skillMatch;
  });

  // Aggiorna il contatore dei risultati
  if (resultsCounter) {
    const totalResources = resources.length;
    const foundResources = filteredResources.length;
    resultsCounter.innerHTML = `
      <i data-lucide="users" class="w-4 h-4 mr-2"></i>
      Trovate <strong>${foundResources}</strong> di <strong>${totalResources}</strong> risorse
    `;
    lucide.createIcons();
  }

  container.innerHTML = "";
  if (filteredResources.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 text-gray-500 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
        <i data-lucide="search-x" class="mx-auto h-16 w-16 mb-4 text-gray-400"></i>
        <h3 class="text-lg font-medium text-gray-900 mb-2">Nessun risultato trovato</h3>
        <p class="text-sm">Prova a modificare i filtri di ricerca per trovare più risultati.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  const resultsList = document.createElement("div");
  resultsList.className = "space-y-6";
  filteredResources.forEach((res) => {
    const card = document.createElement("div");
    card.className = "p-6 border rounded-lg bg-white shadow-md hover:shadow-lg transition-shadow duration-200 search-result-card";
    
    let skillsHtml = res.skills
      .map((s) => {
        const skillInfo = allSkills.find((as) => as.id === s.skill_id);
        const skillName = skillInfo?.name || "N/D";
        
        // Crea le label associate alla skill con stile più elegante
        const skillLabelsHtml = s.labels && s.labels.length > 0
            ? s.labels.map(label => `
                <span class="skill-label inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-md mr-1">
                    <i data-lucide="tag" class="w-3 h-3 mr-1"></i>
                    ${label}
                </span>
              `).join('')
            : '';
        
        // Determina il colore della bubble in base al livello
        let levelColor = 'bg-gray-100 text-gray-800 border-gray-200';
        if (s.level >= 8) levelColor = 'bg-green-100 text-green-800 border-green-200';
        else if (s.level >= 6) levelColor = 'bg-yellow-100 text-yellow-800 border-yellow-200';
        else if (s.level >= 4) levelColor = 'bg-orange-100 text-orange-800 border-orange-200';
        else if (s.level >= 1) levelColor = 'bg-red-100 text-red-800 border-red-200';

        return `
          <div class="skill-container bg-gray-50 p-3 rounded-lg border mb-3">
            <div class="flex items-center justify-between mb-2">
              <span class="inline-flex items-center px-3 py-2 rounded-lg text-sm font-semibold ${levelColor} border">
                <i data-lucide="cpu" class="w-4 h-4 mr-2"></i>
                ${skillName}
                <span class="ml-2 px-2 py-0.5 bg-white bg-opacity-50 rounded-full text-xs">
                  Liv. ${s.level}/10
                </span>
              </span>
            </div>
            ${skillLabelsHtml ? `
              <div class="flex flex-wrap gap-1 mt-2">
                ${skillLabelsHtml}
              </div>
            ` : `
              <div class="text-xs text-gray-500 italic mt-2">
                <i data-lucide="info" class="w-3 h-3 inline mr-1"></i>
                Nessuna label associata
              </div>
            `}
          </div>
        `;
      })
      .join("");

    if (res.skills.length === 0) {
      skillsHtml = `
        <div class="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <i data-lucide="file-x" class="w-8 h-8 mx-auto mb-2"></i>
          <p class="text-sm">Nessuna competenza assegnata</p>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center">
          <div class="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg mr-4">
            ${res.nome.charAt(0)}${res.cognome.charAt(0)}
          </div>
          <div>
            <h3 class="text-xl font-bold text-gray-900">${res.nome} ${res.cognome}</h3>
            <p class="text-sm text-gray-600 flex items-center mt-1">
              <i data-lucide="building" class="w-4 h-4 mr-1"></i>
              ${res.business_unit.name}
            </p>
          </div>
        </div>
        <div class="text-right">
          <p class="text-sm text-gray-600 flex items-center">
            <i data-lucide="mail" class="w-4 h-4 mr-1"></i>
            ${res.email}
          </p>
          <div class="mt-1 flex items-center text-xs text-gray-500">
            <i data-lucide="award" class="w-3 h-3 mr-1"></i>
            ${res.skills.length} competenz${res.skills.length === 1 ? 'a' : 'e'}
          </div>
        </div>
      </div>
      
      <div class="border-t pt-4">
        <div class="flex items-center mb-3">
          <h4 class="font-semibold text-gray-800 flex items-center">
            <i data-lucide="brain" class="w-5 h-5 mr-2 text-purple-600"></i>
            Competenze & Labels
          </h4>
        </div>
        <div class="space-y-2">
          ${skillsHtml}
        </div>
      </div>
    `;
    resultsList.appendChild(card);
  });
  container.appendChild(resultsList);
  lucide.createIcons();
}

// --- Funzioni di supporto e utility ---
function showNotification(message, type) {
  const modal = document.getElementById("notification-modal");
  const iconContainer = document.getElementById("notification-icon");
  const messageEl = document.getElementById("notification-message");

  messageEl.textContent = message;

  let icon, bgColor, iconColor;
  switch (type) {
    case "success":
      icon = "check-circle";
      bgColor = "bg-green-100";
      iconColor = "text-green-600";
      break;
    case "error":
      icon = "x-circle";
      bgColor = "bg-red-100";
      iconColor = "text-red-600";
      break;
    default:
      icon = "info";
      bgColor = "bg-blue-100";
      iconColor = "text-blue-600";
  }

  iconContainer.className = `mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center ${bgColor}`;
  const iconElement = document.createElement("i");
  iconElement.setAttribute("data-lucide", icon);
  iconElement.className = iconColor;
  iconContainer.innerHTML = '';
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
      (r) => r.business_unit.name === name
    );
    if (resourcesInBu.length > 0) {
      const buDeleteName = document.getElementById("bu-delete-name");
      buDeleteName.textContent = name;
      const targetSelect = document.getElementById("bu-migrate-target-select");
      const otherBus = (await api.getBusinessUnits()).filter(
        (bu) => bu.id !== parseInt(id, 10)
      );

      targetSelect.innerHTML = "";
      if (otherBus.length === 0) {
        document.getElementById("bu-delete-option-migrate").disabled = true;
        document.getElementById("bu-delete-option-delete").checked = true; // Use the correct ID for the delete option
        targetSelect.innerHTML = '<option value="">Nessuna BU disponibile per migrazione</option>';
      } else {
        document.getElementById("bu-delete-option-migrate").disabled = false;
        targetSelect.innerHTML = '<option value="">Seleziona BU di destinazione</option>';
        otherBus.forEach(bu => {
            const option = document.createElement('option');
            option.value = bu.id;
            option.textContent = bu.name;
            targetSelect.appendChild(option);
        });
        document.getElementById("bu-delete-option-migrate").checked = true;
      }
      // Set a data attribute on the modal or a hidden input for the BU ID
      buDeleteModal.setAttribute("data-bu-id", id); // Store ID on the modal itself
      buDeleteModal.classList.remove("hidden");
    } else {
      document.getElementById("confirm-delete-message").textContent = `Sei sicuro di voler eliminare ${name}? L'azione è irreversibile.`;
      document.getElementById("confirm-delete-btn").onclick = () =>
        handleDelete(type, id);
      confirmDeleteModal.classList.remove("hidden");
    }
  } else {
    document.getElementById("confirm-delete-message").textContent = `Sei sicuro di voler eliminare ${name}? L'azione è irreversibile.`;
    document.getElementById("confirm-delete-btn").onclick = () =>
      handleDelete(type, id);
    confirmDeleteModal.classList.remove("hidden");
  }
}

async function handleDelete(type, id) {
  try {
    if (type === "resource") {
      await api.deleteResource(id);
      renderResourcesList();
      updateResourceSelector();
      showNotification("Risorsa eliminata con successo!", "success");
    } else if (type === "skill") {
      await api.deleteSkill(id);
      renderSkillsList();
      updateSearchSkillSelector();
      loadAllSkillsForAssignment(); // Refresh skills for assignment view
      showNotification("Skill eliminata con successo!", "success");
    }
    closeModals();
  } catch (error) {
    showNotification(error.message, "error");
  }
}

async function handleDeleteBusinessUnitConfirmed() {
    const buId = buDeleteModal.getAttribute("data-bu-id"); // Get ID from modal data attribute
    const action = document.querySelector('input[name="bu-delete-option"]:checked').value;
    let targetBuId = null;

    if (action === "migrate") {
        targetBuId = document.getElementById("bu-migrate-target-select").value;
        if (!targetBuId) {
            showNotification("Seleziona una Business Unit di destinazione per la migrazione.", "error");
            return;
        }
        targetBuId = parseInt(targetBuId, 10);
    }

    try {
        await api.deleteBusinessUnit(parseInt(buId, 10), { action, target_bu_id: targetBuId });
        showNotification("Business Unit eliminata con successo!", "success");
        renderBuList();
        renderResourcesList();
        updateBuSelectors();
        closeModals();
    } catch (error) {
        showNotification(error.message, "error");
    }
}

function closeModals() {
  confirmDeleteModal.classList.add("hidden");
  buDeleteModal.classList.add("hidden");
  // Nessun modal "add-label-modal" da chiudere qui, è stato rimosso
}

async function loadStats() {
  try {
    const [resources, skills, businessUnits] = await Promise.all([
      api.getResources(),
      api.getSkills(),
      api.getBusinessUnits(),
    ]);

    document.getElementById("total-resources").textContent = resources.length;
    document.getElementById("total-skills").textContent = skills.length;
    document.getElementById("total-bu").textContent = businessUnits.length;

    if (charts.topSkills) charts.topSkills.destroy();
    if (charts.buDistribution) charts.buDistribution.destroy();

    const skillCounts = resources.reduce((acc, r) => {
      r.skills.forEach((s) => {
        acc[s.skill_id] = (acc[s.skill_id] || 0) + 1;
      });
      return acc;
    }, {});

    const sortedSkills = Object.entries(skillCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const skillNames = sortedSkills.map(
      ([skillId]) => skills.find((s) => s.id === parseInt(skillId, 10))?.name || "N/D"
    );
    const skillValues = sortedSkills.map(([, count]) => count);

    charts.topSkills = new Chart(document.getElementById("top-skills-chart"), {
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
        plugins: {
          legend: {
            display: false
          }
        },
      },
    });

    const buCounts = resources.reduce((acc, r) => {
      acc[r.business_unit.name] = (acc[r.business_unit.name] || 0) + 1;
      return acc;
    }, {});

    charts.buDistribution = new Chart(
      document.getElementById("bu-distribution-chart"), {
        type: "doughnut",
        data: {
          labels: Object.keys(buCounts),
          datasets: [{
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
          }, ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: "top"
            }
          },
        },
      }
    );
  } catch (error) {
    showNotification(`Errore nel caricamento delle statistiche: ${error.message}`, "error");
  }
}

// --- ADVANCED THEME MANAGEMENT ---
const themeManager = {
  // Chiavi per localStorage
  THEME_KEY: 'theme-preference',
  
  // Possibili valori del tema
  THEMES: {
    LIGHT: 'light',
    DARK: 'dark',
    AUTO: 'auto'
  },
  
  // Elementi DOM
  themeToggleBtn: document.getElementById("theme-toggle"),
  body: document.body,
  
  // Media query per rilevare le preferenze del sistema
  darkModeMediaQuery: window.matchMedia('(prefers-color-scheme: dark)'),
  
  // Inizializza il sistema di tema
  init() {
    this.applySavedTheme();
    this.setupEventListeners();
    this.updateThemeToggleIcon();
  },
  
  // Rileva il tema preferito del sistema
  getSystemTheme() {
    return this.darkModeMediaQuery.matches ? this.THEMES.DARK : this.THEMES.LIGHT;
  },
  
  // Ottiene la preferenza salvata dall'utente
  getSavedTheme() {
    return localStorage.getItem(this.THEME_KEY) || this.THEMES.AUTO;
  },
  
  // Determina quale tema applicare
  getEffectiveTheme() {
    const savedTheme = this.getSavedTheme();
    
    if (savedTheme === this.THEMES.AUTO) {
      return this.getSystemTheme();
    }
    
    return savedTheme;
  },
  
  // Applica il tema al documento
  applyTheme(theme) {
    this.body.setAttribute("data-theme", theme);
    this.updateThemeToggleIcon();
    lucide.createIcons();
    
    // Dispatch custom event per notificare il cambio tema
    window.dispatchEvent(new CustomEvent('themeChanged', { 
      detail: { theme, savedPreference: this.getSavedTheme() }
    }));
  },
  
  // Applica il tema salvato o quello del sistema
  applySavedTheme() {
    const effectiveTheme = this.getEffectiveTheme();
    this.applyTheme(effectiveTheme);
  },
  
  // Cicla tra le opzioni di tema (light -> dark -> auto -> light...)
  toggleTheme() {
    const currentPreference = this.getSavedTheme();
    let newPreference;
    
    switch (currentPreference) {
      case this.THEMES.LIGHT:
        newPreference = this.THEMES.DARK;
        break;
      case this.THEMES.DARK:
        newPreference = this.THEMES.AUTO;
        break;
      case this.THEMES.AUTO:
      default:
        newPreference = this.THEMES.LIGHT;
        break;
    }
    
    localStorage.setItem(this.THEME_KEY, newPreference);
    const effectiveTheme = this.getEffectiveTheme();
    this.applyTheme(effectiveTheme);
    
    // Mostra notifica del cambio tema
    this.showThemeNotification(newPreference, effectiveTheme);
  },
  
  // Aggiorna l'icona del toggle in base al tema attuale
  updateThemeToggleIcon() {
    const currentTheme = this.body.getAttribute("data-theme");
    const savedPreference = this.getSavedTheme();
    
    // Rimuovi tutte le icone esistenti
    this.themeToggleBtn.innerHTML = '';
    
    let iconHtml = '';
    let tooltipText = '';
    
    if (savedPreference === this.THEMES.AUTO) {
      // Modalità automatica - mostra icona speciale
      iconHtml = `
        <div class="relative">
          <i data-lucide="smartphone" class="w-6 h-6 text-purple-600"></i>
          <div class="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full flex items-center justify-center">
            <i data-lucide="${currentTheme === this.THEMES.DARK ? 'moon' : 'sun'}" class="w-2 h-2 text-white"></i>
          </div>
        </div>
      `;
      tooltipText = `Auto (${currentTheme === this.THEMES.DARK ? 'Scuro' : 'Chiaro'})`;
    } else if (currentTheme === this.THEMES.DARK) {
      iconHtml = '<i data-lucide="moon" class="w-6 h-6 text-blue-400"></i>';
      tooltipText = 'Tema Scuro';
    } else {
      iconHtml = '<i data-lucide="sun" class="w-6 h-6 text-yellow-500"></i>';
      tooltipText = 'Tema Chiaro';
    }
    
    this.themeToggleBtn.innerHTML = `
      <div class="group relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200" title="${tooltipText}">
        ${iconHtml}
        <div class="absolute bottom-full right-0 mb-2 hidden group-hover:block">
          <div class="bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
            ${tooltipText}
            <div class="absolute top-full right-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-900"></div>
          </div>
        </div>
      </div>
    `;
    
    lucide.createIcons();
  },
  
  // Mostra notifica del cambio tema
  showThemeNotification(preference, effectiveTheme) {
    let message = '';
    
    switch (preference) {
      case this.THEMES.LIGHT:
        message = '🌞 Tema impostato su Chiaro';
        break;
      case this.THEMES.DARK:
        message = '🌙 Tema impostato su Scuro';
        break;
      case this.THEMES.AUTO:
        message = `📱 Tema automatico (${effectiveTheme === this.THEMES.DARK ? 'Scuro' : 'Chiaro'})`;
        break;
    }
    
    // Usa la funzione di notifica esistente se disponibile
    if (typeof showNotification === 'function') {
      showNotification(message, 'success');
    }
  },
  
  // Configura gli event listener
  setupEventListeners() {
    // Click sul toggle button
    if (this.themeToggleBtn) {
      this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }
    
    // Ascolta i cambi di preferenza del sistema
    this.darkModeMediaQuery.addEventListener('change', (e) => {
      // Solo se siamo in modalità auto
      if (this.getSavedTheme() === this.THEMES.AUTO) {
        const newTheme = e.matches ? this.THEMES.DARK : this.THEMES.LIGHT;
        this.applyTheme(newTheme);
        console.log(`Sistema cambiato a tema ${newTheme}`);
      }
    });
    
    // Tastiera shortcut per il toggle del tema (Ctrl+Shift+T)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        this.toggleTheme();
      }
    });
  }
};

// Retrocompatibilità con il codice esistente
const themeToggleBtn = themeManager.themeToggleBtn;
const body = themeManager.body;
const applySavedTheme = () => themeManager.applySavedTheme();
const toggleTheme = () => themeManager.toggleTheme();

// Initial view load and theme application
document.addEventListener("DOMContentLoaded", async () => {
  logger.info('🚀 DOMContentLoaded - Inizializzazione app');
  
  // Controlla l'autenticazione prima di inizializzare l'app
  logger.info('🔐 Controllo autenticazione...');
  const isAuthenticated = await auth.checkAuth();
  logger.info('🔐 Risultato autenticazione:', isAuthenticated);
  
  if (!isAuthenticated) {
    logger.warn('❌ Utente non autenticato - reindirizzamento al login');
    return; // L'utente sarà reindirizzato al login
  }
  
  // Inizializza il sistema di gestione tema avanzato
  logger.info('🎨 Inizializzazione tema...');
  themeManager.init();
  
  // Mostra informazioni utente se disponibili e determina la vista di default
  let userInfo = auth.getUserInfo();
  logger.info('👤 Info utente dal localStorage:', userInfo);
  
  // Se non abbiamo info utente ma siamo autenticati, proviamo a recuperarle
  if (!userInfo && isAuthenticated) {
    logger.info('🔄 Tentativo di recupero info utente dal server...');
    try {
      const response = await fetch('/auth/userinfo', {
        headers: {
          'Authorization': `Bearer ${auth.getToken()}`
        }
      });
      if (response.ok) {
        userInfo = await response.json();
        logger.info('✅ Info utente recuperate dal server:', userInfo);
        // Salva nel localStorage per il futuro
        localStorage.setItem('user_info', JSON.stringify(userInfo));
      } else {
        logger.warn('❌ Impossibile recuperare info utente dal server');
      }
    } catch (error) {
      logger.error('❌ Errore nel recupero info utente:', error);
    }
  }
  
  let defaultView = "ricerca"; // Default per utenti non autenticati o non admin
  
  if (userInfo) {
    logger.info('✅ Utente autenticato:', userInfo.email);
    logger.info('📋 Gruppi utente:', userInfo.groups);
    logger.info('🎭 Ruoli utente:', userInfo.roles);
    
    // Mostra il nome utente nell'interfaccia e applica i permessi
    logger.info('🖼️ Chiamata showUserInfo...');
    showUserInfo(userInfo);
    
    // Aggiungi gestore logout
    const logoutBtn = document.getElementById('logout-btn');
    logger.info('🚪 Logout button trovato:', !!logoutBtn);
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logger.info('🚪 Logout richiesto');
        auth.logout();
      });
    }
    
    // Determina la vista iniziale in base ai permessi dell'utente
    // Verifica direttamente i gruppi/ruoli per determinare se è admin
    const adminGroups = ["admin", "administrators", "hr-admin", "skill-matrix-admin"];
    const adminRoles = ["admin", "administrator", "hr-admin", "skill-matrix-admin"];
    
    let isAdmin = false;
    if (userInfo.groups && Array.isArray(userInfo.groups)) {
      isAdmin = userInfo.groups.some(group => adminGroups.includes(group.toLowerCase()));
    }
    if (!isAdmin && userInfo.roles && Array.isArray(userInfo.roles)) {
      isAdmin = userInfo.roles.some(role => adminRoles.includes(role.toLowerCase()));
    }
    
    defaultView = isAdmin ? "risorse" : "ricerca";
    logger.info(`🎯 Vista di default per utente ${isAdmin ? 'admin' : 'normale'}:`, defaultView);
  } else {
    logger.warn('⚠️ Nessuna informazione utente trovata nel localStorage');
  }
  
  logger.info('🔄 Passaggio alla vista:', defaultView);
  switchView(defaultView);
});

// Funzione per mostrare le informazioni dell'utente nell'UI
function showUserInfo(userInfo) {
  logger.info('🖼️ showUserInfo chiamata con:', userInfo);
  
  const userInfoContainer = document.getElementById('user-info');
  const userInitials = document.getElementById('user-initials');
  const userName = document.getElementById('user-name');
  const userEmail = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');
  
  logger.info('🔍 Elementi DOM trovati:', {
    userInfoContainer: !!userInfoContainer,
    userInitials: !!userInitials,
    userName: !!userName,
    userEmail: !!userEmail,
    logoutBtn: !!logoutBtn
  });
  
  if (userInfoContainer && userInfo) {
    // Mostra il container
    logger.info('👁️ Rendendo visibile il container utente');
    userInfoContainer.classList.remove('hidden');
    userInfoContainer.classList.add('flex');
    
    // Estrai le iniziali dal nome/email
    let initials = 'U';
    if (userInfo.name) {
      const nameParts = userInfo.name.split(' ');
      initials = nameParts.map(part => part.charAt(0).toUpperCase()).join('').substring(0, 2);
    } else if (userInfo.email) {
      initials = userInfo.email.charAt(0).toUpperCase();
    }
    
    logger.info('🏷️ Iniziali calcolate:', initials);
    logger.info('👤 Nome utente:', userInfo.name || userInfo.email?.split('@')[0]);
    logger.info('📧 Email utente:', userInfo.email);
    
    // Aggiorna i contenuti
    if (userInitials) {
      userInitials.textContent = initials;
      logger.info('✅ Iniziali impostate');
    }
    if (userName) {
      userName.textContent = userInfo.name || userInfo.email.split('@')[0];
      logger.info('✅ Nome utente impostato');
    }
    if (userEmail) {
      userEmail.textContent = userInfo.email;
      logger.info('✅ Email utente impostata');
    }
    
    // Verifica se l'utente è admin e aggiorna l'interfaccia
    logger.info('🔐 Chiamata checkAndApplyUserPermissions...');
    checkAndApplyUserPermissions(userInfo);
    
    // Configura il pulsante di logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        if (confirm('Sei sicuro di voler effettuare il logout?')) {
          auth.logout();
        }
      });
    }
    
    // Inizializza le icone Lucide per i nuovi elementi
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}

// Funzione per verificare e applicare i permessi utente
function checkAndApplyUserPermissions(userInfo) {
  const body = document.body;
  
  // Lista dei gruppi e ruoli admin (lista estesa)
  const adminGroups = ["admin", "administrators", "hr-admin", "skill-matrix-admin"];
  const adminRoles = ["admin", "administrator", "hr-admin", "skill-matrix-admin"];
  
  // Verifica se l'utente è admin
  let isAdmin = false;
  
  logger.debug('Verifica permessi per utente:', userInfo);
  logger.debug('Gruppi utente:', userInfo.groups);
  logger.debug('Ruoli utente:', userInfo.roles);
  
  if (userInfo.groups && Array.isArray(userInfo.groups)) {
    isAdmin = userInfo.groups.some(group => adminGroups.includes(group.toLowerCase()));
    logger.debug('Controllo gruppi admin:', isAdmin);
  }
  
  if (!isAdmin && userInfo.roles && Array.isArray(userInfo.roles)) {
    isAdmin = userInfo.roles.some(role => adminRoles.includes(role.toLowerCase()));
    logger.debug('Controllo ruoli admin:', isAdmin);
  }
  
  // Applica la classe CSS in base ai permessi
  if (isAdmin) {
    body.classList.add('user-admin');
    logger.info('✅ Utente identificato come admin - accesso completo abilitato');
  } else {
    body.classList.remove('user-admin');
    logger.info('⚠️ Utente non admin - accesso limitato a ricerca e statistiche');
    
    // Se l'utente non è admin e si trova in una vista riservata, 
    // reindirizzalo alla ricerca
    const currentView = getCurrentView();
    const adminOnlyViews = ['risorse', 'skills', 'bu', 'assegna'];
    
    if (adminOnlyViews.includes(currentView)) {
      logger.info('🔄 Reindirizzamento utente non-admin dalla vista riservata alla ricerca');
      switchView('ricerca');
    }
  }
}

// Funzione helper per ottenere la vista corrente
function getCurrentView() {
  const activeTab = document.querySelector('.tab-button.active');
  if (activeTab) {
    const viewId = activeTab.id.replace('tab-', '');
    return viewId;
  }
  return 'ricerca'; // default
}

// Modals event listeners (unchanged)
document.getElementById("cancel-delete-btn").addEventListener("click", closeModals);
// Corrected event listener for BU delete modal cancel button
document.getElementById("cancel-bu-delete-btn").addEventListener("click", closeModals); 
document.getElementById("confirm-bu-delete-btn").addEventListener("click", handleDeleteBusinessUnitConfirmed);
document.getElementById("bu-delete-option-migrate").addEventListener("change", (e) => {
    document.getElementById("bu-migrate-target-select").disabled = !e.target.checked;
});
document.getElementById("bu-delete-option-delete").addEventListener("change", (e) => {
    document.getElementById("bu-migrate-target-select").disabled = e.target.checked;
});

// Add event listener for theme toggle button
if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", toggleTheme);
}

// Function to add a label to a skill (now takes skillId directly)
async function addLabelToSkill(skillId) {
    const labelInput = document.getElementById(`new-label-input-${skillId}`);
    const label = labelInput.value.trim();
    if (!label) {
        showNotification("La label non può essere vuota.", "error");
        return;
    }
    try {
        await api.addLabelToSkill(skillId, label);
        showNotification("Label aggiunta con successo!", "success");
        labelInput.value = ""; // Clear input after adding
        renderSkillsList(); // Refresh the list to show new label
        loadAllSkillsForAssignment(); // Refresh available labels for assignment view
    } catch (error) {
        showNotification(error.message, "error");
    }
}

// Function to remove a label from a skill (unchanged)
async function removeLabel(skillId, label) {
    try {
        await api.removeLabelFromSkill(skillId, label);
        showNotification("Label rimossa con successo!", "success");
        renderSkillsList(); // Refresh the list
        loadAllSkillsForAssignment(); // Refresh available labels for assignment view
    } catch (error) {
        showNotification(error.message, "error");
    }
}

// Function to load all skills for assignment view (unchanged)
function loadSkillsWithLabels() {
    loadAllSkillsForAssignment();
}