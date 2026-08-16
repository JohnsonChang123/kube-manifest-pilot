(function () {
  'use strict';

  const form = document.getElementById('questionnaire');
  if (!form) return;

  const Engine = window.KubeManifestPilotEngine;
  const STORAGE_KEY = 'kube-manifest-pilot.questionnaire.draft.v1';
  const LEGACY_STORAGE_KEY = 'manifestpilot.questionnaire.draft.v1';
  const steps = Array.from(document.querySelectorAll('.wizard-step'));
  const stepButtons = Array.from(document.querySelectorAll('[data-step-target]'));
  const previousButton = document.querySelector('[data-action="previous"]');
  const nextButton = document.querySelector('[data-action="next"]');
  const generateButton = document.querySelector('[data-action="generate"]');
  const saveButton = document.querySelector('[data-action="save-draft"]');
  const dirtyFields = new Set();
  let currentStep = 0;
  let activeOutput = 'yaml';
  let generated = { yaml: '', tutorial: '', json: '' };

  const templateRules = {
    'frontend-backend': { frontend: true, backend: true, database: 'none' },
    postgresql: { frontend: false, backend: false, database: 'internal' },
    frontend: { frontend: true, backend: false, database: 'none' },
    backend: { frontend: false, backend: true, database: 'none' },
    'fullstack-postgresql': { frontend: true, backend: true, database: 'internal' },
    'backend-external-postgresql': { frontend: false, backend: true, database: 'external' }
  };

  const templateLabels = {
    'frontend-backend': '前後端各單副本',
    postgresql: 'PostgreSQL 單副本',
    frontend: '純前端',
    backend: '純後端 API',
    'fullstack-postgresql': '前後端＋PostgreSQL',
    'backend-external-postgresql': '後端＋外部 PostgreSQL'
  };

  const field = name => form.elements.namedItem(name);
  const value = name => field(name)?.value?.trim?.() ?? '';
  const numberValue = (name, fallback = 0) => {
    const parsed = Number(value(name));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const checked = name => Boolean(field(name)?.checked);
  const selectedTemplate = () => form.querySelector('input[name="template"]:checked')?.value || 'frontend-backend';
  const activeRule = () => templateRules[selectedTemplate()] || templateRules['frontend-backend'];
  const lineList = raw => String(raw || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  const configMap = raw => {
    const output = {};
    lineList(raw).forEach(line => {
      const index = line.indexOf('=');
      if (index > 0) output[line.slice(0, index).trim()] = line.slice(index + 1);
    });
    return output;
  };

  const secretEnvironment = raw => lineList(raw).map(line => {
    const equalsIndex = line.indexOf('=');
    const reference = equalsIndex > 0 ? line.slice(equalsIndex + 1).trim() : '';
    const separatorIndex = reference.indexOf(':');
    if (equalsIndex <= 0 || separatorIndex <= 0 || separatorIndex === reference.length - 1) return null;
    return {
      name: line.slice(0, equalsIndex).trim(),
      secretRef: {
        name: reference.slice(0, separatorIndex).trim(),
        key: reference.slice(separatorIndex + 1).trim(),
        optional: false
      }
    };
  }).filter(Boolean);

  function componentSpec(kind) {
    const prefix = kind;
    const readinessType = value(`${prefix}ReadinessType`);
    const livenessEnabled = checked(`${prefix}Liveness`);
    return {
      enabled: Boolean(activeRule()[kind]),
      name: value(`${prefix}Name`),
      image: value(`${prefix}Image`),
      containerPort: numberValue(`${prefix}Port`),
      servicePort: numberValue(`${prefix}ServicePort`),
      replicas: numberValue(`${prefix}Replicas`, 1),
      resources: {
        cpuRequest: value(`${prefix}CpuRequest`),
        cpuLimit: value(`${prefix}CpuLimit`),
        memoryRequest: value(`${prefix}MemoryRequest`),
        memoryLimit: value(`${prefix}MemoryLimit`)
      },
      readiness: {
        enabled: readinessType !== 'none',
        type: readinessType === 'none' ? 'tcp' : readinessType,
        path: value(`${prefix}ReadinessPath`)
      },
      liveness: {
        enabled: livenessEnabled,
        type: 'http',
        path: value(`${prefix}LivenessPath`)
      },
      startup: {
        enabled: checked(`${prefix}Startup`),
        type: value(`${prefix}StartupType`) || 'tcp',
        path: value(`${prefix}StartupPath`)
      },
      configValues: configMap(value(`${prefix}Config`)),
      imagePullSecret: value(`${prefix}PullSecret`),
      command: lineList(value(`${prefix}Command`)),
      args: lineList(value(`${prefix}Args`)),
      env: secretEnvironment(value(`${prefix}SecretEnv`))
    };
  }

  function buildSpec() {
    const mode = value('databaseMode');
    const internal = mode === 'internal';
    return {
      schemaVersion: '1.0',
      generatorVersion: '1.0.0',
      template: selectedTemplate(),
      project: {
        name: value('projectName'),
        namespace: value('namespace'),
        environment: value('environment'),
        createNamespace: checked('createNamespace')
      },
      frontend: componentSpec('frontend'),
      backend: componentSpec('backend'),
      database: {
        mode,
        name: internal ? value('databaseName') : 'postgresql',
        image: internal ? value('databaseImage') : '',
        port: internal ? numberValue('databasePort', 5432) : numberValue('externalPort', 5432),
        databaseName: internal ? value('postgresDatabase') : value('externalDatabase'),
        user: internal ? value('postgresUser') : value('externalUser'),
        pvcSize: internal ? value('pvcSize') : '',
        storageClassName: internal ? value('storageClassName') : '',
        secretName: internal ? value('databaseSecretName') : value('externalSecretName'),
        passwordKey: internal ? value('databasePasswordKey') : value('externalPasswordKey'),
        host: internal ? '' : value('externalHost'),
        hostKey: internal ? '' : value('externalHostKey'),
        userKey: internal ? value('databaseUserKey') : value('externalUserKey'),
        databaseKey: internal ? value('databaseNameKey') : value('externalDatabaseKey')
      },
      exposure: {
        mode: value('exposureMode'),
        ingressClassName: value('ingressClassName'),
        hostname: value('hostname'),
        tls: checked('tlsEnabled'),
        tlsSecretName: value('tlsSecretName')
      },
      options: {
        createPdb: checked('createPdb'),
        hpa: {
          enabled: checked('hpaEnabled'),
          minReplicas: numberValue('hpaMin', 2),
          maxReplicas: numberValue('hpaMax', 5),
          cpuTarget: numberValue('hpaCpu', 70)
        }
      }
    };
  }

  function normalizeSpec(spec) {
    return Engine?.normalizeSpec ? Engine.normalizeSpec(spec) : spec;
  }

  function normalizeValidation(result) {
    if (!result) return { errors: [], warnings: [], infos: [] };
    if (Array.isArray(result)) {
      return {
        errors: result.filter(item => item.level === 'error' || item.severity === 'error'),
        warnings: result.filter(item => item.level === 'warning' || item.severity === 'warning'),
        infos: result.filter(item => item.level === 'info' || item.severity === 'info')
      };
    }
    return {
      errors: result.errors || [],
      warnings: result.warnings || [],
      infos: result.infos || result.info || []
    };
  }

  function localValidation(spec) {
    const errors = [];
    const warnings = [];
    const dns = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/;
    const addError = (fieldName, message) => errors.push({ field: fieldName, message });
    if (!dns.test(spec.project.name)) addError('projectName', '應用名稱必須是有效的 DNS label。');
    if (!dns.test(spec.project.namespace)) addError('namespace', 'Namespace 必須是有效的 DNS label。');
    ['frontend', 'backend'].forEach(kind => {
      const component = spec[kind];
      if (!component.enabled) return;
      if (!dns.test(component.name)) addError(`${kind}Name`, `${kind} Resource Name 格式不正確。`);
      if (!component.image) addError(`${kind}Image`, `${kind} Image 不可空白。`);
      if (component.containerPort < 1 || component.containerPort > 65535) addError(`${kind}Port`, 'Container Port 必須介於 1–65535。');
      if (component.servicePort < 1 || component.servicePort > 65535) addError(`${kind}ServicePort`, 'Service Port 必須介於 1–65535。');
      if (spec.project.environment === 'PRODUCTION' && (!component.image.includes(':') || /:latest$/i.test(component.image))) addError(`${kind}Image`, 'Production 不允許 latest 或沒有版本標籤的 Image。');
      if (component.replicas === 1 && spec.project.environment === 'PRODUCTION') warnings.push({ field: `${kind}Replicas`, message: `${kind} 只有一個副本，更新或故障時可能中斷。` });
      if (!component.readiness.enabled) warnings.push({ field: `${kind}ReadinessType`, message: `${kind} 未設定 Readiness Probe。` });
    });
    if (spec.database.mode === 'internal') {
      if (!spec.database.secretName || !spec.database.passwordKey) addError('databaseSecretName', '內建 PostgreSQL 必須引用既有 Secret 與 password key。');
      if (!/^\d+(?:\.\d+)?(?:Ei|Pi|Ti|Gi|Mi|Ki)$/.test(spec.database.pvcSize)) addError('pvcSize', 'PVC 容量格式不正確，例如 5Gi。');
      warnings.push({ field: 'databaseMode', message: 'PostgreSQL 單副本不具 HA、自動備份或故障切換。' });
    }
    if (spec.database.mode === 'external' && ((!spec.database.host && !spec.database.hostKey) || !spec.database.secretName)) addError('externalHost', '外部 PostgreSQL 必須提供 Host（或 Host Key）與既有 Secret。');
    if (spec.exposure.mode === 'ingress') {
      if (!spec.exposure.ingressClassName) addError('ingressClassName', 'Ingress 必須指定既有 IngressClass。');
      if (!spec.exposure.hostname && spec.project.environment === 'PRODUCTION') addError('hostname', 'Production Ingress 必須提供 Hostname。');
      if (spec.project.environment === 'PRODUCTION' && !spec.exposure.tls) addError('tlsEnabled', 'Production 對外 Ingress 必須啟用 TLS。');
      if (spec.exposure.tls && !spec.exposure.tlsSecretName) addError('tlsSecretName', '啟用 TLS 後必須引用既有 TLS Secret。');
    }
    if (spec.options.hpa.enabled && spec.options.hpa.minReplicas > spec.options.hpa.maxReplicas) addError('hpaMax', 'HPA Max Replicas 不可小於 Min Replicas。');
    ['frontendConfig', 'backendConfig'].forEach(name => {
      lineList(value(name)).forEach(line => {
        const key = line.split('=')[0].trim();
        if (/(password|passwd|token|secret|private.?key|api.?key)/i.test(key)) addError(name, `${key} 看起來是敏感資料，請改用既有 Secret reference。`);
        if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) addError(name, `ConfigMap 行格式錯誤：${line}`);
      });
    });

    ['frontend', 'backend'].forEach(kind => {
      if (!spec[kind].enabled) return;
      const secretField = `${kind}SecretEnv`;
      lineList(value(secretField)).forEach(line => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*=[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?:[A-Za-z0-9._-]+$/.test(line)) {
          addError(secretField, `Secret 參照格式錯誤：${line}；請使用 ENV_NAME=secret-name:key。`);
        }
      });

      [`${kind}Command`, `${kind}Args`].forEach(name => {
        const entries = lineList(value(name));
        entries.forEach((entry, index) => {
          const next = entries[index + 1] || '';
          const inlineAssignment = /(?:password|passwd|token|api[_-]?key|private[_-]?key|client[_-]?secret)\s*[:=]\s*(?!\$\(?[A-Za-z_][A-Za-z0-9_]*\)?)/i.test(entry);
          const splitAssignment = /^--?(?:password|passwd|token|api[_-]?key|private[_-]?key|client[_-]?secret)$/i.test(entry)
            && next && !/^\$\(?[A-Za-z_][A-Za-z0-9_]*\)?$/.test(next);
          const credentialUrl = /^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@/i.test(entry);
          if (inlineAssignment || splitAssignment || credentialUrl) {
            addError(name, 'Command／Args 疑似包含明文憑證；請改用既有 Secret 環境變數參照。');
          }
        });
      });
    });
    return { errors, warnings, infos: [] };
  }

  const engineFieldMap = {
    'project.name': 'projectName',
    'project.namespace': 'namespace',
    'project.environment': 'environment',
    'exposure.ingressClassName': 'ingressClassName',
    'exposure.hostname': 'hostname',
    'exposure.tlsSecretName': 'tlsSecretName',
    'options.hpa.minReplicas': 'hpaMin',
    'options.hpa.maxReplicas': 'hpaMax',
    'options.hpa.cpuTarget': 'hpaCpu'
  };

  function issueField(issue) {
    if (issue.field && field(issue.field)) return issue.field;
    const path = issue.path || issue.field || '';
    if (engineFieldMap[path]) return engineFieldMap[path];
    if (path.startsWith('database.')) {
      const mode = value('databaseMode');
      const internal = mode === 'internal';
      const suffix = path.slice('database.'.length);
      const internalMap = {
        name: 'databaseName', image: 'databaseImage', port: 'databasePort', pvcSize: 'pvcSize',
        storageClassName: 'storageClassName', secretName: 'databaseSecretName',
        passwordKey: 'databasePasswordKey', userKey: 'databaseUserKey', databaseKey: 'databaseNameKey'
      };
      const externalMap = {
        host: 'externalHost', port: 'externalPort', databaseName: 'externalDatabase', user: 'externalUser',
        secretName: 'externalSecretName', passwordKey: 'externalPasswordKey', hostKey: 'externalHostKey',
        userKey: 'externalUserKey', databaseKey: 'externalDatabaseKey'
      };
      return (internal ? internalMap : externalMap)[suffix] || '';
    }
    const componentMatch = path.match(/^(frontend|backend)\.(name|image|containerPort|servicePort|replicas)$/);
    if (componentMatch) {
      const suffix = { name: 'Name', image: 'Image', containerPort: 'Port', servicePort: 'ServicePort', replicas: 'Replicas' }[componentMatch[2]];
      return `${componentMatch[1]}${suffix}`;
    }
    const probeMatch = path.match(/^(frontend|backend)\.(readiness|liveness|startup)\.(type|path)$/);
    if (probeMatch) {
      const probe = probeMatch[2][0].toUpperCase() + probeMatch[2].slice(1);
      const suffix = probeMatch[3] === 'type' ? 'Type' : 'Path';
      return `${probeMatch[1]}${probe}${suffix}`;
    }
    if (/^(frontend|backend)\.env\[/.test(path)) return `${path.split('.')[0]}SecretEnv`;
    return '';
  }

  function validate(spec) {
    const local = localValidation(spec);
    if (!Engine?.validateSpec) return local;
    try {
      const engineResult = normalizeValidation(Engine.validateSpec(normalizeSpec(spec)));
      const seen = new Set();
      const merge = list => list.filter(item => {
        const key = `${item.field || ''}:${item.message || item.code || String(item)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return {
        errors: merge([...local.errors, ...engineResult.errors]),
        warnings: merge([...local.warnings, ...engineResult.warnings]),
        infos: merge([...local.infos, ...engineResult.infos])
      };
    } catch (error) {
      return { errors: [...local.errors, { field: '', message: `生成核心驗證失敗：${error.message}` }], warnings: local.warnings, infos: [] };
    }
  }

  function applyTemplate() {
    const rule = activeRule();
    document.querySelectorAll('[data-component]').forEach(section => {
      const visible = Boolean(rule[section.dataset.component]);
      section.hidden = !visible;
      section.querySelectorAll('input,select,textarea').forEach(control => control.disabled = !visible);
    });
    const databaseMode = field('databaseMode');
    databaseMode.value = rule.database;
    databaseMode.disabled = selectedTemplate() === 'postgresql';
    updateDatabasePanels();
    updateSummary();
  }

  function updateDatabasePanels() {
    const mode = value('databaseMode');
    document.querySelectorAll('[data-database-panel]').forEach(panel => {
      const visible = panel.dataset.databasePanel === mode;
      panel.hidden = !visible;
      panel.querySelectorAll('input,select,textarea').forEach(control => control.disabled = !visible);
    });
  }

  function updateConditionalFields() {
    const ingress = value('exposureMode') === 'ingress';
    const ingressFields = document.querySelector('[data-ingress-fields]');
    ingressFields.hidden = !ingress;
    ingressFields.querySelectorAll('input,select').forEach(control => control.disabled = !ingress);
    field('tlsSecretName').closest('.field').hidden = !checked('tlsEnabled') || !ingress;
    const hpa = checked('hpaEnabled');
    const hpaFields = document.querySelector('[data-hpa-fields]');
    hpaFields.hidden = !hpa;
    hpaFields.querySelectorAll('input').forEach(control => control.disabled = !hpa);
  }

  function setIfClean(name, nextValue) {
    if (!dirtyFields.has(name) && field(name)) field(name).value = String(nextValue);
  }

  function applyEnvironmentDefaults() {
    const production = value('environment') === 'PRODUCTION';
    setIfClean('namespace', `${value('projectName') || 'my-app'}-${production ? 'prod' : 'dev'}`);
    if (!dirtyFields.has('createNamespace')) field('createNamespace').checked = !production;
    ['frontend', 'backend'].forEach(kind => setIfClean(`${kind}Replicas`, production ? 2 : 1));
    setIfClean('frontendCpuRequest', production ? '100m' : '50m');
    setIfClean('frontendCpuLimit', production ? '500m' : '250m');
    setIfClean('frontendMemoryRequest', production ? '128Mi' : '64Mi');
    setIfClean('frontendMemoryLimit', production ? '512Mi' : '256Mi');
    setIfClean('backendCpuRequest', production ? '250m' : '100m');
    setIfClean('backendCpuLimit', production ? '1' : '500m');
    setIfClean('backendMemoryRequest', production ? '256Mi' : '128Mi');
    setIfClean('backendMemoryLimit', production ? '1Gi' : '512Mi');
    setIfClean('pvcSize', production ? '20Gi' : '5Gi');
    if (!dirtyFields.has('createPdb')) field('createPdb').checked = production;
    updateSummary();
  }

  function showStep(index) {
    currentStep = Math.max(0, Math.min(steps.length - 1, Number(index)));
    steps.forEach((step, i) => step.hidden = i !== currentStep);
    stepButtons.forEach((button, i) => {
      button.classList.toggle('active', i === currentStep);
      button.classList.toggle('complete', i < currentStep);
      button.setAttribute('aria-current', i === currentStep ? 'step' : 'false');
    });
    previousButton.disabled = currentStep === 0;
    nextButton.hidden = currentStep === steps.length - 1;
    generateButton.hidden = currentStep !== steps.length - 1;
    if (currentStep === steps.length - 1) renderReview();
    document.querySelector('.wizard-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function visibleRequiredErrors() {
    const current = steps[currentStep];
    const errors = [];
    current.querySelectorAll('[required]:not(:disabled)').forEach(control => {
      control.removeAttribute('aria-invalid');
      if (!String(control.value || '').trim()) {
        control.setAttribute('aria-invalid', 'true');
        errors.push(control);
      }
    });
    return errors;
  }

  function updateFieldErrors(validation) {
    document.querySelectorAll('[data-error-for]').forEach(item => item.textContent = '');
    form.querySelectorAll('[aria-invalid="true"]').forEach(item => item.removeAttribute('aria-invalid'));
    validation.errors.forEach(issue => {
      const fieldName = issueField(issue);
      if (!fieldName) return;
      const control = field(fieldName);
      if (control) control.setAttribute('aria-invalid', 'true');
      const target = document.querySelector(`[data-error-for="${CSS.escape(fieldName)}"]`);
      if (target && !target.textContent) target.textContent = issue.message || issue.code || '欄位有誤';
    });
  }

  function expectedResources(spec) {
    const kinds = [];
    const hasApplication = spec.frontend.enabled || spec.backend.enabled;
    if (spec.project.createNamespace) kinds.push('Namespace');
    if (spec.frontend.enabled) kinds.push('Deployment/frontend', 'Service/frontend');
    if (spec.backend.enabled) kinds.push('Deployment/backend', 'Service/backend');
    if (Object.keys(spec.frontend.configValues || {}).length && spec.frontend.enabled) kinds.push('ConfigMap/frontend');
    if (Object.keys(spec.backend.configValues || {}).length && spec.backend.enabled) kinds.push('ConfigMap/backend');
    if (spec.database.mode === 'internal') kinds.push('Service/headless', 'Service/postgresql', 'StatefulSet/postgresql');
    if (spec.exposure.mode === 'ingress') kinds.push('Ingress');
    if (spec.options.createPdb && hasApplication) kinds.push('PDB');
    if (spec.options.hpa.enabled && hasApplication) kinds.push('HPA');
    return kinds;
  }

  function summaryEntries(spec) {
    const components = [spec.frontend.enabled && 'Frontend', spec.backend.enabled && 'Backend', spec.database.mode !== 'none' && 'PostgreSQL'].filter(Boolean).join('＋') || 'PostgreSQL';
    return [
      ['範本', templateLabels[spec.template] || spec.template],
      ['應用', spec.project.name || '—'],
      ['Namespace', spec.project.namespace || '—'],
      ['環境', spec.project.environment],
      ['元件', components],
      ['入口', ({ clusterip: 'ClusterIP', ingress: 'Ingress', loadbalancer: 'LoadBalancer' })[spec.exposure.mode] || spec.exposure.mode],
      ['資料庫', ({ none: '無', internal: '內建單副本', external: '外部 PostgreSQL' })[spec.database.mode]]
    ];
  }

  function renderDefinitionList(target, entries) {
    target.replaceChildren();
    entries.forEach(([term, description]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = description;
      row.append(dt, dd);
      target.append(row);
    });
  }

  function updateSummary() {
    const spec = buildSpec();
    renderDefinitionList(document.getElementById('liveSummary'), summaryEntries(spec));
    const chips = document.getElementById('resourcePreview');
    chips.replaceChildren();
    expectedResources(spec).forEach(resource => {
      const chip = document.createElement('span');
      chip.className = 'resource-chip';
      chip.textContent = resource;
      chips.append(chip);
    });
    const validation = validate(spec);
    const status = document.getElementById('liveStatus');
    status.className = `status-box ${validation.errors.length ? 'danger' : validation.warnings.length ? 'warning' : 'success'}`;
    status.textContent = validation.errors.length
      ? `${validation.errors.length} 個阻擋錯誤待修正。`
      : validation.warnings.length
        ? `可產生，但有 ${validation.warnings.length} 個風險提醒。`
        : '必要欄位與關聯檢查通過。';
  }

  function issueText(issue) {
    if (typeof issue === 'string') return issue;
    return issue.message || issue.code || '未命名檢查項目';
  }

  function renderReview() {
    const spec = buildSpec();
    const validation = validate(spec);
    renderDefinitionList(document.getElementById('reviewSummary'), summaryEntries(spec));
    const list = document.getElementById('issueList');
    list.replaceChildren();
    const combined = [
      ...validation.errors.map(item => ({ ...item, type: 'error' })),
      ...validation.warnings.map(item => ({ ...item, type: 'warning' })),
      ...validation.infos.map(item => ({ ...item, type: 'info' }))
    ];
    if (!combined.length) combined.push({ type: 'info', message: '沒有發現阻擋錯誤或風險警告。' });
    combined.forEach(issue => {
      const li = document.createElement('li');
      li.className = `issue ${issue.type}`;
      li.textContent = `${issue.type === 'error' ? '阻擋' : issue.type === 'warning' ? '警告' : '資訊'}：${issueText(issue)}`;
      list.append(li);
    });
    updateFieldErrors(validation);
    generateButton.disabled = Boolean(validation.errors.length || !Engine);
    return { spec, validation };
  }

  function generatedText(method, spec) {
    if (!Engine || typeof Engine[method] !== 'function') throw new Error('產生核心尚未載入。');
    return Engine[method](normalizeSpec(spec));
  }

  function generate() {
    const { spec, validation } = renderReview();
    if (validation.errors.length) {
      window.KubeManifestPilotSite?.toast(`請先修正 ${validation.errors.length} 個阻擋錯誤。`);
      return;
    }
    try {
      generated.yaml = generatedText('generateManifest', spec);
      generated.tutorial = generatedText('generateTutorial', spec);
      generated.json = generatedText('generateQuestionnaireJson', spec);
      document.getElementById('yamlOutput').textContent = generated.yaml;
      document.getElementById('tutorialOutput').textContent = generated.tutorial;
      document.getElementById('jsonOutput').textContent = generated.json;
      document.getElementById('outputStatus').textContent = `已產生 ${expectedResources(spec).length} 類資源 · 通過產生器規則`;
      window.KubeManifestPilotSite?.toast('Manifest、Questionnaire JSON 與部署教學已產生。');
      saveDraft(true);
    } catch (error) {
      document.getElementById('outputStatus').textContent = `產生失敗：${error.message}`;
      window.KubeManifestPilotSite?.toast(`產生失敗：${error.message}`);
    }
  }

  function setOutputTab(name) {
    activeOutput = name;
    document.querySelectorAll('[data-output-tab]').forEach(tab => {
      const active = tab.dataset.outputTab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.getElementById('yamlOutput').hidden = name !== 'yaml';
    document.getElementById('tutorialOutput').hidden = name !== 'tutorial';
    document.getElementById('jsonOutput').hidden = name !== 'json';
  }

  async function copyText(text) {
    if (!text) throw new Error('尚未產生內容。');
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return; } catch (_) { /* fallback */ }
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('瀏覽器不允許複製。');
  }

  function download(filename, content, type) {
    if (!content) throw new Error('尚未產生內容。');
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function baseFilename() {
    return (value('projectName') || 'kube-manifest-pilot').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'kube-manifest-pilot';
  }

  function currentOutput() {
    return generated[activeOutput] || '';
  }

  const draftWhitelist = new Set([
    'template', 'projectName', 'namespace', 'environment', 'createNamespace',
    'frontendName', 'frontendImage', 'frontendPort', 'frontendServicePort', 'frontendReplicas',
    'frontendCpuRequest', 'frontendCpuLimit', 'frontendMemoryRequest', 'frontendMemoryLimit',
    'frontendReadinessType', 'frontendReadinessPath', 'frontendLiveness', 'frontendLivenessPath',
    'frontendStartup', 'frontendStartupType', 'frontendStartupPath',
    'backendName', 'backendImage', 'backendPort', 'backendServicePort', 'backendReplicas',
    'backendCpuRequest', 'backendCpuLimit', 'backendMemoryRequest', 'backendMemoryLimit',
    'backendReadinessType', 'backendReadinessPath', 'backendLiveness', 'backendLivenessPath',
    'backendStartup', 'backendStartupType', 'backendStartupPath',
    'databaseMode', 'databaseName', 'databaseImage', 'databasePort', 'postgresDatabase', 'postgresUser',
    'pvcSize', 'storageClassName', 'externalPort', 'externalDatabase', 'externalUser',
    'exposureMode', 'ingressClassName', 'hostname', 'tlsEnabled', 'createPdb', 'hpaEnabled', 'hpaMin', 'hpaMax', 'hpaCpu'
  ]);

  function saveDraft(silent = false) {
    try {
      const data = {};
      Array.from(form.elements).forEach(control => {
        if (!control.name || !draftWhitelist.has(control.name)) return;
        if (control.type === 'radio') {
          if (control.checked) data[control.name] = control.value;
        } else if (control.type === 'checkbox') data[control.name] = control.checked;
        else data[control.name] = control.value;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      if (!silent) window.KubeManifestPilotSite?.toast('已儲存非敏感問卷草稿；Secret 名稱、Config 與命令未保存。');
    } catch (_) {
      if (!silent) window.KubeManifestPilotSite?.toast('瀏覽器不允許保存草稿，仍可繼續產生與下載。');
    }
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.entries(data).forEach(([name, stored]) => {
        if (!draftWhitelist.has(name)) return;
        const controls = form.elements.namedItem(name);
        if (!controls) return;
        if (controls instanceof RadioNodeList) {
          Array.from(controls).forEach(control => control.checked = control.value === stored);
        } else if (controls.type === 'checkbox') controls.checked = Boolean(stored);
        else controls.value = stored;
      });
      window.KubeManifestPilotSite?.toast('已恢復此瀏覽器中的非敏感問卷草稿。');
    } catch (_) { /* Ignore damaged storage. */ }
  }

  function applyTemplateFromUrl() {
    try {
      const requested = new URLSearchParams(window.location.search).get('template');
      if (!requested || !templateRules[requested]) return;
      const control = form.querySelector(`input[name="template"][value="${CSS.escape(requested)}"]`);
      if (control) control.checked = true;
    } catch (_) { /* URL parameters are optional. */ }
  }

  function resetDraft() {
    if (!window.confirm('確定清除本機草稿並恢復預設問卷嗎？')) return;
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (_) { /* continue */ }
    form.reset();
    dirtyFields.clear();
    generated = { yaml: '', tutorial: '', json: '' };
    applyTemplate();
    updateConditionalFields();
    showStep(0);
    window.KubeManifestPilotSite?.toast('問卷已恢復預設值。');
  }

  form.addEventListener('input', event => {
    if (event.target.name) dirtyFields.add(event.target.name);
    if (event.target.name === 'environment') applyEnvironmentDefaults();
    if (event.target.name === 'projectName' && !dirtyFields.has('namespace')) applyEnvironmentDefaults();
    updateConditionalFields();
    updateSummary();
  });
  form.addEventListener('change', event => {
    if (event.target.name === 'template') applyTemplate();
    if (event.target.name === 'databaseMode') updateDatabasePanels();
    if (event.target.name === 'environment') applyEnvironmentDefaults();
    updateConditionalFields();
    updateSummary();
  });

  stepButtons.forEach(button => button.addEventListener('click', () => showStep(Number(button.dataset.stepTarget))));
  previousButton.addEventListener('click', () => showStep(currentStep - 1));
  nextButton.addEventListener('click', () => {
    const missing = visibleRequiredErrors();
    if (missing.length) {
      missing[0].focus();
      window.KubeManifestPilotSite?.toast('請完成目前步驟的必要欄位。');
      return;
    }
    showStep(currentStep + 1);
  });
  generateButton.addEventListener('click', generate);
  saveButton.addEventListener('click', () => saveDraft(false));
  document.getElementById('resetDraft').addEventListener('click', resetDraft);
  document.querySelectorAll('[data-output-tab]').forEach(tab => tab.addEventListener('click', () => setOutputTab(tab.dataset.outputTab)));
  document.getElementById('copyOutput').addEventListener('click', async () => {
    try { await copyText(currentOutput()); window.KubeManifestPilotSite?.toast('目前內容已複製。'); }
    catch (error) { window.KubeManifestPilotSite?.toast(error.message); }
  });
  document.getElementById('downloadCurrent').addEventListener('click', () => {
    try {
      const base = baseFilename();
      const details = activeOutput === 'yaml'
        ? [`${base}-kubernetes.yaml`, 'application/yaml']
        : activeOutput === 'tutorial'
          ? ['DEPLOY.md', 'text/markdown']
          : [`${base}.questionnaire.json`, 'application/json'];
      download(details[0], currentOutput(), details[1]);
    } catch (error) { window.KubeManifestPilotSite?.toast(error.message); }
  });
  document.getElementById('downloadAll').addEventListener('click', () => {
    try {
      const base = baseFilename();
      download(`${base}-kubernetes.yaml`, generated.yaml, 'application/yaml');
      window.setTimeout(() => download('DEPLOY.md', generated.tutorial, 'text/markdown'), 120);
      window.setTimeout(() => download(`${base}.questionnaire.json`, generated.json, 'application/json'), 240);
    } catch (error) { window.KubeManifestPilotSite?.toast(error.message); }
  });

  restoreDraft();
  applyTemplateFromUrl();
  applyTemplate();
  updateConditionalFields();
  updateSummary();
  showStep(0);
  if (!Engine) {
    document.getElementById('liveStatus').className = 'status-box danger';
    document.getElementById('liveStatus').textContent = 'Manifest 產生核心載入失敗。';
    generateButton.disabled = true;
  }
})();
