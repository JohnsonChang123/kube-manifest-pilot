/*
 * KubeManifestPilot generator engine
 *
 * Pure JavaScript, deterministic and dependency-free so the same file works
 * in GitHub Pages and in Node-based tests.
 */
(function (root, factory) {
  var api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.KubeManifestPilotEngine = api;
    root.ManifestPilotEngine = api;
  }
}(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var ENGINE_VERSION = "1.0.0";
  var SCHEMA_VERSION = "1.0";
  var TICK = String.fromCharCode(96);
  var FENCE = String.fromCharCode(96, 96, 96);

  var TEMPLATE_ALIASES = {
    "frontend-backend": "frontend-backend",
    "frontend-backend-single-node": "frontend-backend",
    "single-node-fullstack": "frontend-backend",
    "postgresql": "postgresql",
    "postgresql-single-node": "postgresql",
    "postgresql-single-replica": "postgresql",
    "frontend": "frontend",
    "backend": "backend",
    "fullstack-postgresql": "fullstack-postgresql",
    "backend-external-postgresql": "backend-external-postgresql"
  };

  var TEMPLATE_PRESETS = {
    "frontend-backend": { frontend: true, backend: true, databaseMode: "none" },
    "postgresql": { frontend: false, backend: false, databaseMode: "internal" },
    "frontend": { frontend: true, backend: false, databaseMode: "none" },
    "backend": { frontend: false, backend: true, databaseMode: "none" },
    "fullstack-postgresql": { frontend: true, backend: true, databaseMode: "internal" },
    "backend-external-postgresql": { frontend: false, backend: true, databaseMode: "external" }
  };

  var COMPONENT_DEFAULTS = {
    frontend: {
      image: "nginx:1.27-alpine",
      containerPort: 8080,
      servicePort: 80,
      cpuRequest: "25m",
      cpuLimit: "200m",
      memoryRequest: "32Mi",
      memoryLimit: "128Mi"
    },
    backend: {
      image: "nginx:1.27-alpine",
      containerPort: 8080,
      servicePort: 8080,
      cpuRequest: "50m",
      cpuLimit: "500m",
      memoryRequest: "64Mi",
      memoryLimit: "256Mi"
    }
  };

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function defined(value, fallback) {
    return value === undefined || value === null ? fallback : value;
  }

  function firstDefined(values, fallback) {
    var i;
    for (i = 0; i < values.length; i += 1) {
      if (values[i] !== undefined && values[i] !== null) {
        return values[i];
      }
    }
    return fallback;
  }

  function text(value, fallback) {
    var selected = defined(value, fallback === undefined ? "" : fallback);
    return String(selected).trim();
  }

  function lowerText(value, fallback) {
    return text(value, fallback).toLowerCase();
  }

  function booleanValue(value, fallback) {
    if (value === undefined || value === null || value === "") {
      return Boolean(fallback);
    }
    if (typeof value === "string") {
      if (value.toLowerCase() === "false" || value === "0") {
        return false;
      }
      if (value.toLowerCase() === "true" || value === "1") {
        return true;
      }
    }
    return Boolean(value);
  }

  function integerValue(value, fallback) {
    if (value === undefined || value === null) {
      return fallback;
    }
    if (value === "") {
      return 0;
    }
    return Number(value);
  }

  function normalizeStringArray(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) {
        return String(item);
      }).filter(function (item) {
        return item.length > 0;
      });
    }

    if (typeof value === "string") {
      return value.split(/\r?\n/).map(function (line) {
        return line.trim();
      }).filter(Boolean);
    }

    return [];
  }

  function sortedRecord(value) {
    var result = {};
    if (!isObject(value)) {
      return result;
    }

    Object.keys(value).sort().forEach(function (key) {
      var entry = value[key];
      if (entry !== undefined && entry !== null) {
        result[String(key)] = String(entry);
      }
    });
    return result;
  }

  function normalizeSecretRef(value) {
    var source = isObject(value) ? value : {};
    return {
      name: text(firstDefined([source.name, source.secretName], "")),
      key: text(firstDefined([source.key, source.secretKey], "")),
      optional: booleanValue(source.optional, false)
    };
  }

  function normalizeEnv(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map(function (entry) {
      var source = isObject(entry) ? entry : {};
      var normalized = { name: text(source.name) };
      var ref = firstDefined([source.secretRef, source.valueFrom && source.valueFrom.secretKeyRef], null);

      if (ref) {
        normalized.secretRef = normalizeSecretRef(ref);
      } else {
        normalized.value = source.value === undefined || source.value === null ? "" : String(source.value);
      }
      return normalized;
    }).sort(function (left, right) {
      var nameOrder = left.name.localeCompare(right.name);
      if (nameOrder !== 0) {
        return nameOrder;
      }
      return stableStringify(left, 0).localeCompare(stableStringify(right, 0));
    });
  }

  function normalizeProbe(value, defaultPath) {
    var source = isObject(value) ? value : {};
    return {
      enabled: booleanValue(source.enabled, false),
      type: lowerText(source.type, "http"),
      path: text(source.path, defaultPath),
      command: normalizeStringArray(source.command)
    };
  }

  function normalizeResources(value, defaults) {
    var source = isObject(value) ? value : {};
    var requests = isObject(source.requests) ? source.requests : {};
    var limits = isObject(source.limits) ? source.limits : {};

    return {
      cpuRequest: text(firstDefined([source.cpuRequest, requests.cpu], defaults.cpuRequest)),
      cpuLimit: text(firstDefined([source.cpuLimit, limits.cpu], defaults.cpuLimit)),
      memoryRequest: text(firstDefined([source.memoryRequest, requests.memory], defaults.memoryRequest)),
      memoryLimit: text(firstDefined([source.memoryLimit, limits.memory], defaults.memoryLimit))
    };
  }

  function normalizeComponent(role, value, projectName, defaultEnabled) {
    var source = isObject(value) ? value : {};
    var defaults = COMPONENT_DEFAULTS[role];
    var defaultName = projectName + "-" + role;
    var pullSecret = firstDefined([source.imagePullSecret, source.imagePullSecrets && source.imagePullSecrets[0]], "");

    if (isObject(pullSecret)) {
      pullSecret = pullSecret.name;
    }

    return {
      enabled: booleanValue(source.enabled, defaultEnabled),
      name: lowerText(source.name, defaultName),
      image: text(source.image, defaults.image),
      containerPort: integerValue(firstDefined([source.containerPort, source.port], undefined), defaults.containerPort),
      servicePort: integerValue(source.servicePort, defaults.servicePort),
      replicas: integerValue(source.replicas, 1),
      resources: normalizeResources(source.resources, defaults),
      command: normalizeStringArray(source.command),
      args: normalizeStringArray(source.args),
      env: normalizeEnv(source.env),
      configValues: sortedRecord(firstDefined([source.configValues, source.config], {})),
      imagePullSecret: lowerText(pullSecret, ""),
      readiness: normalizeProbe(source.readiness, "/healthz"),
      liveness: normalizeProbe(source.liveness, "/healthz"),
      startup: normalizeProbe(source.startup, "/healthz")
    };
  }

  function normalizeTemplate(value) {
    var requested = lowerText(value, "frontend-backend");
    return TEMPLATE_ALIASES[requested] || requested;
  }

  function normalizeSpec(input) {
    var source = isObject(input) ? input : {};
    var template = normalizeTemplate(firstDefined([source.template, source.templateId], "frontend-backend"));
    var preset = TEMPLATE_PRESETS[template] || TEMPLATE_PRESETS["frontend-backend"];
    var projectSource = isObject(source.project) ? source.project : {};
    var projectName = lowerText(firstDefined([
      projectSource.name,
      source.applicationName,
      source.appName
    ], "kube-manifest-pilot-app"));
    var environment = text(firstDefined([projectSource.environment, source.environment], "DEV")).toUpperCase();
    var components = isObject(source.components) ? source.components : {};
    var databaseSource = isObject(source.database) ? source.database : {};
    var exposureSource = isObject(source.exposure) ? source.exposure : {};
    var optionsSource = isObject(source.options) ? source.options : {};
    var hpaSource = isObject(optionsSource.hpa) ? optionsSource.hpa : {};
    var tlsSource = isObject(exposureSource.tls) ? exposureSource.tls : {};
    var databaseMode = lowerText(databaseSource.mode, preset.databaseMode);
    var databaseName = lowerText(databaseSource.name, projectName + "-postgresql");
    var databaseResources = normalizeResources(databaseSource.resources, {
      cpuRequest: "100m",
      cpuLimit: "1",
      memoryRequest: "256Mi",
      memoryLimit: "1Gi"
    });

    if (environment === "PROD") {
      environment = "PRODUCTION";
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      template: template,
      project: {
        name: projectName,
        namespace: lowerText(firstDefined([projectSource.namespace, source.namespace], projectName)),
        environment: environment,
        createNamespace: booleanValue(projectSource.createNamespace, true)
      },
      frontend: normalizeComponent(
        "frontend",
        firstDefined([source.frontend, components.frontend], {}),
        projectName,
        preset.frontend
      ),
      backend: normalizeComponent(
        "backend",
        firstDefined([source.backend, components.backend], {}),
        projectName,
        preset.backend
      ),
      database: {
        mode: databaseMode,
        name: databaseName,
        image: text(databaseSource.image, "postgres:16-alpine"),
        port: integerValue(databaseSource.port, 5432),
        databaseName: text(databaseSource.databaseName, "app"),
        user: text(databaseSource.user, "app"),
        pvcSize: text(firstDefined([
          databaseSource.pvcSize,
          databaseSource.pvc && databaseSource.pvc.size
        ], "5Gi")),
        storageClassName: text(firstDefined([
          databaseSource.storageClassName,
          databaseSource.pvc && databaseSource.pvc.storageClassName
        ], "")),
        secretName: lowerText(databaseSource.secretName, databaseName + "-credentials"),
        passwordKey: text(databaseSource.passwordKey, "POSTGRES_PASSWORD"),
        host: text(databaseSource.host, ""),
        hostKey: text(databaseSource.hostKey, ""),
        userKey: text(databaseSource.userKey, "POSTGRES_USER"),
        databaseKey: text(databaseSource.databaseKey, "POSTGRES_DB"),
        resources: databaseResources,
        imagePullSecret: lowerText(databaseSource.imagePullSecret, "")
      },
      exposure: {
        mode: lowerText(firstDefined([exposureSource.mode, exposureSource.type], "clusterip")),
        ingressClassName: lowerText(exposureSource.ingressClassName, ""),
        hostname: lowerText(firstDefined([exposureSource.hostname, exposureSource.host], "")),
        tls: booleanValue(firstDefined([tlsSource.enabled, exposureSource.tls], false), false),
        tlsSecretName: lowerText(firstDefined([exposureSource.tlsSecretName, tlsSource.secretName], ""))
      },
      options: {
        createPdb: booleanValue(optionsSource.createPdb, false),
        hpa: {
          enabled: booleanValue(hpaSource.enabled, false),
          minReplicas: integerValue(hpaSource.minReplicas, 1),
          maxReplicas: integerValue(hpaSource.maxReplicas, 3),
          cpuTarget: integerValue(firstDefined([hpaSource.cpuTarget, hpaSource.targetCPUUtilizationPercentage], undefined), 70)
        }
      }
    };
  }

  function issue(code, path, message, details) {
    var result = {
      code: code,
      field: path,
      path: path,
      message: message
    };
    if (details !== undefined) {
      result.details = details;
    }
    return result;
  }

  function hasPlaceholder(value) {
    return typeof value === "string" && /(?:CHANGE[_-]?ME|REPLACE[_-]?ME|YOUR[_-](?:VALUE|NAME|HOST|DOMAIN|IMAGE)|\bTODO\b)/i.test(value);
  }

  function scanNormalizedPlaceholders(value, path, errors) {
    if (typeof value === "string") {
      if (hasPlaceholder(value) && !errors.some(function (entry) {
        return entry.code === "UNRESOLVED_PLACEHOLDER" && entry.path === path;
      })) {
        errors.push(issue(
          "UNRESOLVED_PLACEHOLDER",
          path,
          "欄位仍包含 CHANGE_ME、REPLACE_ME、YOUR_VALUE 或 TODO 等未替換 placeholder。"
        ));
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(function (entry, index) {
        scanNormalizedPlaceholders(entry, path + "[" + index + "]", errors);
      });
      return;
    }
    if (isObject(value)) {
      Object.keys(value).forEach(function (key) {
        var childPath = path ? path + "." + key : key;
        scanNormalizedPlaceholders(key, childPath, errors);
        scanNormalizedPlaceholders(value[key], childPath, errors);
      });
    }
  }

  function isDnsLabel(value) {
    return typeof value === "string" &&
      value.length >= 1 &&
      value.length <= 63 &&
      /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/.test(value);
  }

  function isDnsSubdomain(value) {
    return typeof value === "string" &&
      value.length >= 1 &&
      value.length <= 253 &&
      value.split(".").every(isDnsLabel);
  }

  function isPort(value) {
    return Number.isInteger(value) && value >= 1 && value <= 65535;
  }

  function isReplicaCount(value) {
    return Number.isInteger(value) && value >= 1 && value <= 1000;
  }

  function isSecretKey(value) {
    return typeof value === "string" && value.length >= 1 && value.length <= 253 && /^[A-Za-z0-9._-]+$/.test(value);
  }

  function isConfigKey(value) {
    return isSecretKey(value);
  }

  function isEnvironmentName(value) {
    return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
  }

  function isSensitiveName(value) {
    return /(?:PASSWORD|PASSWD|TOKEN|SECRET|API[_-]?KEY|PRIVATE[_-]?KEY|SIGNING[_-]?KEY|ENCRYPTION[_-]?KEY|ACCESS[_-]?KEY|CREDENTIAL|KUBECONFIG)/i.test(String(value));
  }

  function maskEnvironmentReferences(value) {
    return String(value).replace(
      /\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*/g,
      "__ENV_REFERENCE__"
    );
  }

  function isEnvironmentReferenceValue(value) {
    return /^\s*["']?(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*)["']?\s*$/.test(String(value));
  }

  function isSensitiveOptionToken(value) {
    return /^\s*(?:--?)?(?:password|passwd|token|api[_-]?key|client[_-]?secret|access[_-]?key)\s*$/i.test(String(value));
  }

  function containsLiteralCredential(value) {
    var masked = maskEnvironmentReferences(value);
    var cliFlag = /(?:^|\s)--?(?:password|passwd|token|api[_-]?key|client[_-]?secret|access[_-]?key)(?:\s*=\s*|\s+)["']?(?!__ENV_REFERENCE__)(?:[^\s"']+)/i;
    var structuredValue = /["']?(?:password|passwd|token|api[_-]?key|client[_-]?secret|access[_-]?key)["']?\s*:\s*["']?(?!__ENV_REFERENCE__)(?:[^\s"',}]+)/i;
    var bearerToken = /\bBearer\s+(?!__ENV_REFERENCE__)[A-Za-z0-9._~+\/=-]+/i;
    var credentialUrl = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^:\/\s@]+:(?!__ENV_REFERENCE__)[^@\s\/]+@/;
    var assignmentPattern = /(?:^|\s)(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^\s"']+)/ig;
    var assignmentMatch;
    var literalAssignment = false;

    while ((assignmentMatch = assignmentPattern.exec(masked)) !== null) {
      if (isSensitiveName(assignmentMatch[1]) && assignmentMatch[2] !== "__ENV_REFERENCE__") {
        literalAssignment = true;
        break;
      }
    }

    return cliFlag.test(masked) ||
      literalAssignment ||
      structuredValue.test(masked) ||
      bearerToken.test(masked) ||
      credentialUrl.test(masked);
  }

  function sensitiveCommandIndexes(values) {
    var indexes = {};
    values.forEach(function (value, index) {
      if (containsLiteralCredential(value)) {
        indexes[index] = true;
      }
      if (isSensitiveOptionToken(value) &&
          index + 1 < values.length &&
          String(values[index + 1]).length > 0 &&
          !isEnvironmentReferenceValue(values[index + 1])) {
        indexes[index + 1] = true;
      }
    });
    return indexes;
  }

  function validateCommandAndArgs(component, path, errors) {
    var records = component.command.map(function (value, index) {
      return { value: value, field: path + ".command[" + index + "]" };
    }).concat(component.args.map(function (value, index) {
      return { value: value, field: path + ".args[" + index + "]" };
    }));
    var values = records.map(function (record) {
      return record.value;
    });
    var sensitiveIndexes = sensitiveCommandIndexes(values);

    Object.keys(sensitiveIndexes).forEach(function (index) {
      errors.push(issue(
        "SENSITIVE_COMMAND_VALUE",
        records[Number(index)].field,
        "Command 或 Args 疑似包含明文密碼、Token 或憑證；請改用既有 Secret 注入的環境變數參照。"
      ));
    });
  }

  function imageTagInfo(image) {
    var value = String(image || "");
    var digestIndex = value.lastIndexOf("@");
    var slashIndex = value.lastIndexOf("/");
    var colonIndex = value.lastIndexOf(":");
    var hasDigest = digestIndex > slashIndex && digestIndex < value.length - 1;
    var hasTag = colonIndex > slashIndex && colonIndex < value.length - 1;
    return {
      hasVersion: hasDigest || hasTag,
      isLatest: hasTag && value.slice(colonIndex + 1).toLowerCase() === "latest"
    };
  }

  function scanRawSensitive(value, path, errors, parentKey) {
    var explicitlySensitive = {
      password: true,
      token: true,
      kubeconfig: true,
      privatekey: true,
      clientsecret: true,
      secretvalue: true,
      apikey: true
    };

    if (Array.isArray(value)) {
      value.forEach(function (entry, index) {
        scanRawSensitive(entry, path + "[" + index + "]", errors, parentKey);
      });
      return;
    }

    if (!isObject(value)) {
      return;
    }

    Object.keys(value).forEach(function (key) {
      var normalizedKey = key.toLowerCase().replace(/[_-]/g, "");
      var child = value[key];
      var childPath = path ? path + "." + key : key;

      if (explicitlySensitive[normalizedKey] && child !== undefined && child !== null && String(child).length > 0) {
        errors.push(issue(
          "SENSITIVE_VALUE_NOT_ALLOWED",
          childPath,
          "不得輸入或保存密碼、Token、kubeconfig 或私鑰；請改用既有 Secret 名稱與 Key。"
        ));
        return;
      }

      if ((key === "configValues" || key === "config") && isObject(child)) {
        Object.keys(child).forEach(function (configKey) {
          if (isSensitiveName(configKey) && String(child[configKey]).length > 0) {
            errors.push(issue(
              "SENSITIVE_CONFIGMAP_VALUE",
              childPath + "." + configKey,
              "疑似敏感資料不得寫入 ConfigMap；請改用既有 Secret 參照。"
            ));
          }
        });
      }

      if (key === "env" && Array.isArray(child)) {
        child.forEach(function (entry, index) {
          if (isObject(entry) && isSensitiveName(entry.name) && own(entry, "value") && String(entry.value).length > 0) {
            errors.push(issue(
              "SENSITIVE_ENV_VALUE",
              childPath + "[" + index + "].value",
              "敏感環境變數不得使用明文 value；請使用 secretRef。"
            ));
          }
        });
      }

      scanRawSensitive(child, childPath, errors, key);
    });
  }

  function validateName(value, path, errors) {
    if (!isDnsLabel(value)) {
      errors.push(issue(
        "INVALID_DNS_LABEL",
        path,
        "名稱必須是 1–63 字元的 Kubernetes DNS label，只能使用小寫英數字與連字號。"
      ));
    }
  }

  function validateQuantity(value, path, errors) {
    if (!value || /\s/.test(value) || hasPlaceholder(value) || !/^[0-9]+(?:\.[0-9]+)?(?:[EPTGMK]i?|[numkMGTPE]|m)?$/.test(value)) {
      errors.push(issue("INVALID_RESOURCE_QUANTITY", path, "資源數量格式無效。"));
    }
  }

  function validateProbe(probe, path, errors) {
    if (!probe.enabled) {
      return;
    }

    if (["http", "tcp", "exec"].indexOf(probe.type) === -1) {
      errors.push(issue("INVALID_PROBE_TYPE", path + ".type", "Probe 類型必須是 http、tcp 或 exec。"));
      return;
    }

    if (probe.type === "http" && (!probe.path || probe.path.charAt(0) !== "/")) {
      errors.push(issue("INVALID_PROBE_PATH", path + ".path", "HTTP Probe path 必須以 / 開頭。"));
    }

    if (probe.type === "exec" && probe.command.length === 0) {
      errors.push(issue("MISSING_PROBE_COMMAND", path + ".command", "Exec Probe 必須提供 command。"));
    }
  }

  function validateImage(image, path, environment, errors) {
    var tag = imageTagInfo(image);
    if (!image || /\s/.test(image) || hasPlaceholder(image)) {
      errors.push(issue("INVALID_IMAGE", path, "容器 Image 不得為空、包含空白或未替換值。"));
      return;
    }

    if (environment === "PRODUCTION" && !tag.hasVersion) {
      errors.push(issue("PRODUCTION_IMAGE_VERSION_REQUIRED", path, "PRODUCTION Image 必須指定 tag 或 digest。"));
    }
    if (environment === "PRODUCTION" && tag.isLatest) {
      errors.push(issue("PRODUCTION_LATEST_FORBIDDEN", path, "PRODUCTION 禁止使用 latest tag。"));
    }
  }

  function validateComponent(component, role, spec, errors, warnings) {
    var path = role;
    var seenEnv = {};
    var reservedDatabaseEnv = {
      DATABASE_HOST: true,
      DATABASE_PORT: true,
      DATABASE_NAME: true,
      DATABASE_USER: true,
      DATABASE_PASSWORD: true
    };

    if (!component.enabled) {
      return;
    }

    validateName(component.name, path + ".name", errors);
    if (component.name.length > 56 && Object.keys(component.configValues).length > 0) {
      errors.push(issue("DERIVED_NAME_TOO_LONG", path + ".name", "啟用 ConfigMap 時元件名稱最多 56 字元。"));
    }
    validateImage(component.image, path + ".image", spec.project.environment, errors);

    if (!isPort(component.containerPort)) {
      errors.push(issue("INVALID_CONTAINER_PORT", path + ".containerPort", "Container Port 必須是 1–65535 的整數。"));
    }
    if (!isPort(component.servicePort)) {
      errors.push(issue("INVALID_SERVICE_PORT", path + ".servicePort", "Service Port 必須是 1–65535 的整數。"));
    }
    if (!isReplicaCount(component.replicas)) {
      errors.push(issue("INVALID_REPLICAS", path + ".replicas", "Replica 必須是 1–1000 的整數。"));
    }

    validateQuantity(component.resources.cpuRequest, path + ".resources.cpuRequest", errors);
    validateQuantity(component.resources.cpuLimit, path + ".resources.cpuLimit", errors);
    validateQuantity(component.resources.memoryRequest, path + ".resources.memoryRequest", errors);
    validateQuantity(component.resources.memoryLimit, path + ".resources.memoryLimit", errors);

    if (component.imagePullSecret && !isDnsSubdomain(component.imagePullSecret)) {
      errors.push(issue("INVALID_SECRET_NAME", path + ".imagePullSecret", "Image Pull Secret 名稱不是有效的 DNS subdomain。"));
    }

    Object.keys(component.configValues).forEach(function (key) {
      if (!isConfigKey(key)) {
        errors.push(issue("INVALID_CONFIGMAP_KEY", path + ".configValues." + key, "ConfigMap Key 格式無效。"));
      }
      if (hasPlaceholder(component.configValues[key])) {
        errors.push(issue("UNRESOLVED_PLACEHOLDER", path + ".configValues." + key, "設定值仍包含未替換的 placeholder。"));
      }
    });

    component.env.forEach(function (entry, index) {
      var envPath = path + ".env[" + index + "]";
      if (!isEnvironmentName(entry.name)) {
        errors.push(issue("INVALID_ENV_NAME", envPath + ".name", "環境變數名稱格式無效。"));
      }
      if (seenEnv[entry.name]) {
        errors.push(issue("DUPLICATE_ENV_NAME", envPath + ".name", "同一元件不得重複定義環境變數。"));
      }
      seenEnv[entry.name] = true;

      if (role === "backend" && spec.database.mode !== "none" && reservedDatabaseEnv[entry.name]) {
        errors.push(issue("RESERVED_DATABASE_ENV", envPath + ".name", "資料庫模式已自動管理此環境變數，請移除重複定義。"));
      }

      if (entry.secretRef) {
        if (!isDnsSubdomain(entry.secretRef.name)) {
          errors.push(issue("INVALID_SECRET_NAME", envPath + ".secretRef.name", "Secret 名稱格式無效。"));
        }
        if (!isSecretKey(entry.secretRef.key)) {
          errors.push(issue("INVALID_SECRET_KEY", envPath + ".secretRef.key", "Secret Key 格式無效。"));
        }
      } else {
        if (isSensitiveName(entry.name) && entry.value) {
          errors.push(issue("SENSITIVE_ENV_VALUE", envPath + ".value", "敏感環境變數必須使用 secretRef。"));
        }
        if (hasPlaceholder(entry.value)) {
          errors.push(issue("UNRESOLVED_PLACEHOLDER", envPath + ".value", "環境變數仍包含未替換的 placeholder。"));
        }
      }
    });

    validateProbe(component.readiness, path + ".readiness", errors);
    validateProbe(component.liveness, path + ".liveness", errors);
    validateProbe(component.startup, path + ".startup", errors);
    validateCommandAndArgs(component, path, errors);

    if (spec.options.createPdb && component.replicas === 1) {
      warnings.push(issue(
        "SINGLE_REPLICA_PDB",
        path + ".replicas",
        "單副本搭配 minAvailable: 1 的 PDB 會阻止自願性中斷，但仍無法提供高可用。"
      ));
    }
  }

  function validateDatabase(spec, errors, warnings) {
    var database = spec.database;
    var path = "database";
    var production = spec.project.environment === "PRODUCTION";

    if (["none", "internal", "external"].indexOf(database.mode) === -1) {
      errors.push(issue("INVALID_DATABASE_MODE", path + ".mode", "資料庫模式必須是 none、internal 或 external。"));
      return;
    }

    if (database.mode === "none") {
      return;
    }

    if (!isPort(database.port)) {
      errors.push(issue("INVALID_DATABASE_PORT", path + ".port", "資料庫 Port 必須是 1–65535 的整數。"));
    }
    if (!isDnsSubdomain(database.secretName)) {
      errors.push(issue("INVALID_SECRET_NAME", path + ".secretName", "資料庫 Secret 名稱格式無效。"));
    }
    if (!isSecretKey(database.passwordKey)) {
      errors.push(issue("INVALID_SECRET_KEY", path + ".passwordKey", "passwordKey 格式無效。"));
    }

    if (production) {
      if (!isSecretKey(database.userKey)) {
        errors.push(issue("PRODUCTION_USER_SECRET_KEY_REQUIRED", path + ".userKey", "PRODUCTION 必須用既有 Secret Key 提供資料庫使用者。"));
      }
      if (!isSecretKey(database.databaseKey)) {
        errors.push(issue("PRODUCTION_DATABASE_SECRET_KEY_REQUIRED", path + ".databaseKey", "PRODUCTION 必須用既有 Secret Key 提供資料庫名稱。"));
      }
    } else {
      if (!database.user && !isSecretKey(database.userKey)) {
        errors.push(issue("DATABASE_USER_REQUIRED", path + ".user", "必須提供資料庫使用者或對應 Secret Key。"));
      }
      if (!database.databaseName && !isSecretKey(database.databaseKey)) {
        errors.push(issue("DATABASE_NAME_REQUIRED", path + ".databaseName", "必須提供資料庫名稱或對應 Secret Key。"));
      }
    }

    if (database.mode === "internal") {
      validateName(database.name, path + ".name", errors);
      if (database.name.length > 54) {
        errors.push(issue("DERIVED_NAME_TOO_LONG", path + ".name", "PostgreSQL 名稱最多 54 字元，需保留 headless Service 後綴。"));
      }
      validateImage(database.image, path + ".image", spec.project.environment, errors);
      validateQuantity(database.pvcSize, path + ".pvcSize", errors);
      validateQuantity(database.resources.cpuRequest, path + ".resources.cpuRequest", errors);
      validateQuantity(database.resources.cpuLimit, path + ".resources.cpuLimit", errors);
      validateQuantity(database.resources.memoryRequest, path + ".resources.memoryRequest", errors);
      validateQuantity(database.resources.memoryLimit, path + ".resources.memoryLimit", errors);
      if (database.storageClassName && !isDnsSubdomain(database.storageClassName)) {
        errors.push(issue("INVALID_STORAGE_CLASS", path + ".storageClassName", "StorageClass 名稱格式無效。"));
      }
      if (database.imagePullSecret && !isDnsSubdomain(database.imagePullSecret)) {
        errors.push(issue("INVALID_SECRET_NAME", path + ".imagePullSecret", "Image Pull Secret 名稱格式無效。"));
      }
      warnings.push(issue(
        "POSTGRESQL_SINGLE_REPLICA",
        path + ".mode",
        "內建 PostgreSQL 是單副本示範，不提供 HA、自動備份或故障切換。"
      ));
    }

    if (database.mode === "external") {
      if (!database.host && !isSecretKey(database.hostKey)) {
        errors.push(issue("EXTERNAL_DATABASE_HOST_REQUIRED", path + ".host", "外部 PostgreSQL 必須提供 host 或 hostKey。"));
      }
      if (database.host && (/\s/.test(database.host) || hasPlaceholder(database.host))) {
        errors.push(issue("INVALID_DATABASE_HOST", path + ".host", "外部 PostgreSQL Host 格式無效或仍含 placeholder。"));
      }
      if (database.hostKey && !isSecretKey(database.hostKey)) {
        errors.push(issue("INVALID_SECRET_KEY", path + ".hostKey", "hostKey 格式無效。"));
      }
    }
  }

  function validateExposure(spec, errors, warnings) {
    var exposure = spec.exposure;
    var hasApplication = spec.frontend.enabled || spec.backend.enabled;

    if (["clusterip", "ingress", "loadbalancer"].indexOf(exposure.mode) === -1) {
      errors.push(issue("INVALID_EXPOSURE_MODE", "exposure.mode", "對外方式必須是 clusterip、ingress 或 loadbalancer。"));
      return;
    }

    if (!hasApplication && exposure.mode !== "clusterip") {
      errors.push(issue("EXPOSURE_TARGET_REQUIRED", "exposure.mode", "Ingress 或 LoadBalancer 至少需要一個應用元件。"));
    }

    if (exposure.mode === "ingress") {
      if (!isDnsSubdomain(exposure.hostname)) {
        errors.push(issue("INVALID_INGRESS_HOSTNAME", "exposure.hostname", "Ingress hostname 必須是有效的 DNS 名稱。"));
      }
      if (exposure.ingressClassName && !isDnsSubdomain(exposure.ingressClassName)) {
        errors.push(issue("INVALID_INGRESS_CLASS", "exposure.ingressClassName", "IngressClass 名稱格式無效。"));
      }
      if (exposure.tls && !isDnsSubdomain(exposure.tlsSecretName)) {
        errors.push(issue("TLS_SECRET_REQUIRED", "exposure.tlsSecretName", "啟用 TLS 時必須引用既有 TLS Secret。"));
      }
      warnings.push(issue(
        "INGRESS_CONTROLLER_REQUIRED",
        "exposure.mode",
        "產生器只建立 Ingress Resource，不會安裝 Ingress Controller 或 DNS。"
      ));
    }

    if (exposure.mode === "loadbalancer") {
      warnings.push(issue(
        "LOADBALANCER_PROVIDER_REQUIRED",
        "exposure.mode",
        "LoadBalancer 需要叢集或雲端供應商提供實作。"
      ));
    }
  }

  function validateOptions(spec, errors, warnings) {
    var hpa = spec.options.hpa;
    var components = [spec.frontend, spec.backend].filter(function (component) {
      return component.enabled;
    });

    if (hpa.enabled) {
      if (components.length === 0) {
        errors.push(issue("HPA_TARGET_REQUIRED", "options.hpa.enabled", "HPA 至少需要一個已啟用的 Deployment。"));
      }
      if (!Number.isInteger(hpa.minReplicas) || hpa.minReplicas < 1) {
        errors.push(issue("INVALID_HPA_MIN", "options.hpa.minReplicas", "HPA minReplicas 必須是大於等於 1 的整數。"));
      }
      if (!Number.isInteger(hpa.maxReplicas) || hpa.maxReplicas < hpa.minReplicas) {
        errors.push(issue("INVALID_HPA_MAX", "options.hpa.maxReplicas", "HPA maxReplicas 必須大於等於 minReplicas。"));
      }
      if (!Number.isInteger(hpa.cpuTarget) || hpa.cpuTarget < 1 || hpa.cpuTarget > 100) {
        errors.push(issue("INVALID_HPA_CPU_TARGET", "options.hpa.cpuTarget", "HPA CPU 目標必須是 1–100 的整數。"));
      }
      warnings.push(issue(
        "METRICS_SERVER_REQUIRED",
        "options.hpa.enabled",
        "HPA 需要叢集已有可用的 Resource Metrics API；產生器不會安裝 Metrics Server。"
      ));
    }
  }

  function resourceIdentity(resource) {
    var resourceMetadata = isObject(resource && resource.metadata) ? resource.metadata : {};
    return [
      text(resource && resource.apiVersion),
      text(resource && resource.kind),
      text(resourceMetadata.namespace),
      text(resourceMetadata.name)
    ].join("|");
  }

  function duplicateResourceIdentities(resources) {
    var seen = {};
    var duplicates = [];

    resources.forEach(function (resource, index) {
      var identity = resourceIdentity(resource);
      if (own(seen, identity)) {
        duplicates.push({
          identity: identity,
          firstIndex: seen[identity],
          duplicateIndex: index,
          apiVersion: text(resource.apiVersion),
          kind: text(resource.kind),
          namespace: text(resource.metadata && resource.metadata.namespace),
          name: text(resource.metadata && resource.metadata.name)
        });
      } else {
        seen[identity] = index;
      }
    });
    return duplicates;
  }

  function validateGeneratedIdentities(spec, errors) {
    var duplicates = duplicateResourceIdentities(rawBuildResources(spec));
    duplicates.forEach(function (duplicate) {
      errors.push(issue(
        "DUPLICATE_RESOURCE_IDENTITY",
        "resources[" + duplicate.duplicateIndex + "]",
        "產生的 Kubernetes Resource identity 重複：" +
          duplicate.apiVersion + " " + duplicate.kind + " " +
          (duplicate.namespace || "(cluster-scoped)") + "/" + duplicate.name + "。",
        duplicate
      ));
    });
  }

  function validateSpec(input) {
    var errors = [];
    var warnings = [];
    var notices = [];
    var source = isObject(input) ? input : {};
    var spec = normalizeSpec(source);
    var enabledNames = {};

    scanRawSensitive(source, "", errors, "");

    if (!TEMPLATE_PRESETS[spec.template]) {
      errors.push(issue("UNKNOWN_TEMPLATE", "template", "不支援的範本。"));
    }
    validateName(spec.project.name, "project.name", errors);
    validateName(spec.project.namespace, "project.namespace", errors);
    if (["DEV", "PRODUCTION"].indexOf(spec.project.environment) === -1) {
      errors.push(issue("INVALID_ENVIRONMENT", "project.environment", "環境必須是 DEV 或 PRODUCTION。"));
    }
    if (spec.project.name.length > 55 && spec.exposure.mode === "ingress") {
      errors.push(issue("DERIVED_NAME_TOO_LONG", "project.name", "啟用 Ingress 時應用名稱最多 55 字元。"));
    }

    validateComponent(spec.frontend, "frontend", spec, errors, warnings);
    validateComponent(spec.backend, "backend", spec, errors, warnings);
    validateDatabase(spec, errors, warnings);
    validateExposure(spec, errors, warnings);
    validateOptions(spec, errors, warnings);
    scanNormalizedPlaceholders(spec, "", errors);

    [spec.frontend, spec.backend].forEach(function (component) {
      if (component.enabled) {
        if (enabledNames[component.name]) {
          errors.push(issue("DUPLICATE_RESOURCE_NAME", "components", "啟用的元件不得使用相同名稱。"));
        }
        enabledNames[component.name] = true;
      }
    });
    if (spec.database.mode === "internal" && enabledNames[spec.database.name]) {
      errors.push(issue("DUPLICATE_RESOURCE_NAME", "database.name", "PostgreSQL 名稱不得與應用元件相同。"));
    }

    validateGeneratedIdentities(spec, errors);

    if (!spec.frontend.enabled && !spec.backend.enabled && spec.database.mode === "none") {
      errors.push(issue("EMPTY_ARCHITECTURE", "template", "至少必須啟用一個應用元件或資料庫。"));
    }

    if (spec.project.environment === "DEV") {
      notices.push(issue("DEVELOPMENT_CONFIGURATION", "project.environment", "DEV 設定仍應在部署前執行 server dry-run。"));
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings,
      infos: notices,
      notices: notices,
      spec: spec
    };
  }

  function KubeManifestPilotValidationError(report) {
    this.name = "KubeManifestPilotValidationError";
    this.message = "QuestionnaireSpec validation failed with " + report.errors.length + " error(s).";
    this.report = report;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, KubeManifestPilotValidationError);
    }
  }
  KubeManifestPilotValidationError.prototype = Object.create(Error.prototype);
  KubeManifestPilotValidationError.prototype.constructor = KubeManifestPilotValidationError;

  function assertValid(input) {
    var report = validateSpec(input);
    if (!report.valid) {
      throw new KubeManifestPilotValidationError(report);
    }
    return report;
  }

  function appLabels(spec, name, component) {
    return {
      "app.kubernetes.io/name": name,
      "app.kubernetes.io/instance": spec.project.name,
      "app.kubernetes.io/component": component,
      "app.kubernetes.io/managed-by": "kube-manifest-pilot"
    };
  }

  function selectorLabels(spec, name, component) {
    return {
      "app.kubernetes.io/name": name,
      "app.kubernetes.io/instance": spec.project.name,
      "app.kubernetes.io/component": component
    };
  }

  function metadata(spec, name, component) {
    return {
      name: name,
      namespace: spec.project.namespace,
      labels: appLabels(spec, name, component)
    };
  }

  function secretKeyEnv(name, secretName, key, optional) {
    var secretKeyRef = {
      name: secretName,
      key: key
    };
    if (optional) {
      secretKeyRef.optional = true;
    }
    return {
      name: name,
      valueFrom: {
        secretKeyRef: secretKeyRef
      }
    };
  }

  function literalEnv(name, value) {
    return {
      name: name,
      value: String(value)
    };
  }

  function databaseEnv(spec) {
    var database = spec.database;
    var production = spec.project.environment === "PRODUCTION";
    var environment = [];

    if (database.mode === "none") {
      return environment;
    }

    if (database.mode === "internal") {
      environment.push(literalEnv("DATABASE_HOST", database.name));
    } else if (database.hostKey) {
      environment.push(secretKeyEnv("DATABASE_HOST", database.secretName, database.hostKey, false));
    } else {
      environment.push(literalEnv("DATABASE_HOST", database.host));
    }

    environment.push(literalEnv("DATABASE_PORT", database.port));

    if (production || (!database.databaseName && database.databaseKey)) {
      environment.push(secretKeyEnv("DATABASE_NAME", database.secretName, database.databaseKey, false));
    } else {
      environment.push(literalEnv("DATABASE_NAME", database.databaseName));
    }

    if (production || (!database.user && database.userKey)) {
      environment.push(secretKeyEnv("DATABASE_USER", database.secretName, database.userKey, false));
    } else {
      environment.push(literalEnv("DATABASE_USER", database.user));
    }

    environment.push(secretKeyEnv("DATABASE_PASSWORD", database.secretName, database.passwordKey, false));
    return environment.sort(function (left, right) {
      return left.name.localeCompare(right.name);
    });
  }

  function postgresEnv(spec) {
    var database = spec.database;
    var production = spec.project.environment === "PRODUCTION";
    var environment = [];

    if (production || (!database.databaseName && database.databaseKey)) {
      environment.push(secretKeyEnv("POSTGRES_DB", database.secretName, database.databaseKey, false));
    } else {
      environment.push(literalEnv("POSTGRES_DB", database.databaseName));
    }

    if (production || (!database.user && database.userKey)) {
      environment.push(secretKeyEnv("POSTGRES_USER", database.secretName, database.userKey, false));
    } else {
      environment.push(literalEnv("POSTGRES_USER", database.user));
    }

    environment.push(secretKeyEnv("POSTGRES_PASSWORD", database.secretName, database.passwordKey, false));
    environment.push(literalEnv("PGDATA", "/var/lib/postgresql/data/pgdata"));
    return environment.sort(function (left, right) {
      return left.name.localeCompare(right.name);
    });
  }

  function buildProbe(probe) {
    var result = {};
    if (probe.type === "http") {
      result.httpGet = {
        path: probe.path,
        port: "http"
      };
    } else if (probe.type === "tcp") {
      result.tcpSocket = {
        port: "http"
      };
    } else {
      result.exec = {
        command: probe.command.slice()
      };
    }

    result.initialDelaySeconds = probe.type === "http" ? 3 : 5;
    result.periodSeconds = 10;
    result.timeoutSeconds = 2;
    result.failureThreshold = 3;
    return result;
  }

  function buildResourceRequirements(resources) {
    return {
      requests: {
        cpu: resources.cpuRequest,
        memory: resources.memoryRequest
      },
      limits: {
        cpu: resources.cpuLimit,
        memory: resources.memoryLimit
      }
    };
  }

  function buildConfigMap(spec, component, role) {
    return {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: metadata(spec, component.name + "-config", role),
      data: sortedRecord(component.configValues)
    };
  }

  function buildDeployment(spec, component, role) {
    var labels = selectorLabels(spec, component.name, role);
    var container = {
      name: component.name,
      image: component.image,
      imagePullPolicy: imageTagInfo(component.image).isLatest ? "Always" : "IfNotPresent",
      ports: [{
        name: "http",
        containerPort: component.containerPort,
        protocol: "TCP"
      }],
      resources: buildResourceRequirements(component.resources)
    };
    var podSpec = {
      containers: [container]
    };
    var environment = component.env.map(function (entry) {
      if (entry.secretRef) {
        return secretKeyEnv(entry.name, entry.secretRef.name, entry.secretRef.key, entry.secretRef.optional);
      }
      return literalEnv(entry.name, entry.value);
    });

    if (role === "backend" && spec.database.mode !== "none") {
      environment = environment.concat(databaseEnv(spec));
    }
    environment.sort(function (left, right) {
      return left.name.localeCompare(right.name);
    });

    if (environment.length > 0) {
      container.env = environment;
    }
    if (Object.keys(component.configValues).length > 0) {
      container.envFrom = [{
        configMapRef: {
          name: component.name + "-config"
        }
      }];
    }
    if (component.command.length > 0) {
      container.command = component.command.slice();
    }
    if (component.args.length > 0) {
      container.args = component.args.slice();
    }
    if (component.readiness.enabled) {
      container.readinessProbe = buildProbe(component.readiness);
    }
    if (component.liveness.enabled) {
      container.livenessProbe = buildProbe(component.liveness);
    }
    if (component.startup.enabled) {
      container.startupProbe = buildProbe(component.startup);
      container.startupProbe.failureThreshold = 30;
      container.startupProbe.periodSeconds = 5;
    }
    if (component.imagePullSecret) {
      podSpec.imagePullSecrets = [{ name: component.imagePullSecret }];
    }

    return {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: metadata(spec, component.name, role),
      spec: {
        replicas: component.replicas,
        selector: {
          matchLabels: labels
        },
        template: {
          metadata: {
            labels: labels
          },
          spec: podSpec
        }
      }
    };
  }

  function exposedRole(spec) {
    return spec.frontend.enabled ? "frontend" : (spec.backend.enabled ? "backend" : "");
  }

  function buildService(spec, component, role) {
    var isPublic = exposedRole(spec) === role;
    return {
      apiVersion: "v1",
      kind: "Service",
      metadata: metadata(spec, component.name, role),
      spec: {
        type: isPublic && spec.exposure.mode === "loadbalancer" ? "LoadBalancer" : "ClusterIP",
        selector: selectorLabels(spec, component.name, role),
        ports: [{
          name: "http",
          protocol: "TCP",
          port: component.servicePort,
          targetPort: "http"
        }]
      }
    };
  }

  function buildPostgresResources(spec) {
    var database = spec.database;
    var labels = selectorLabels(spec, database.name, "database");
    var claimSpec = {
      accessModes: ["ReadWriteOnce"],
      resources: {
        requests: {
          storage: database.pvcSize
        }
      }
    };
    var podSpec = {
      securityContext: {
        fsGroup: 999
      },
      containers: [{
        name: "postgresql",
        image: database.image,
        imagePullPolicy: imageTagInfo(database.image).isLatest ? "Always" : "IfNotPresent",
        ports: [{
          name: "postgresql",
          containerPort: database.port,
          protocol: "TCP"
        }],
        env: postgresEnv(spec),
        readinessProbe: {
          exec: {
            command: ["sh", "-c", "pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\""]
          },
          initialDelaySeconds: 5,
          periodSeconds: 5,
          timeoutSeconds: 3,
          failureThreshold: 6
        },
        livenessProbe: {
          exec: {
            command: ["sh", "-c", "pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\""]
          },
          initialDelaySeconds: 30,
          periodSeconds: 10,
          timeoutSeconds: 3,
          failureThreshold: 6
        },
        resources: buildResourceRequirements(database.resources),
        volumeMounts: [{
          name: "data",
          mountPath: "/var/lib/postgresql/data"
        }]
      }]
    };

    if (database.storageClassName) {
      claimSpec.storageClassName = database.storageClassName;
    }
    if (database.imagePullSecret) {
      podSpec.imagePullSecrets = [{ name: database.imagePullSecret }];
    }

    return [{
      apiVersion: "v1",
      kind: "Service",
      metadata: metadata(spec, database.name + "-headless", "database"),
      spec: {
        clusterIP: "None",
        publishNotReadyAddresses: true,
        selector: labels,
        ports: [{
          name: "postgresql",
          protocol: "TCP",
          port: database.port,
          targetPort: "postgresql"
        }]
      }
    }, {
      apiVersion: "v1",
      kind: "Service",
      metadata: metadata(spec, database.name, "database"),
      spec: {
        type: "ClusterIP",
        selector: labels,
        ports: [{
          name: "postgresql",
          protocol: "TCP",
          port: database.port,
          targetPort: "postgresql"
        }]
      }
    }, {
      apiVersion: "apps/v1",
      kind: "StatefulSet",
      metadata: metadata(spec, database.name, "database"),
      spec: {
        serviceName: database.name + "-headless",
        replicas: 1,
        selector: {
          matchLabels: labels
        },
        template: {
          metadata: {
            labels: labels
          },
          spec: podSpec
        },
        volumeClaimTemplates: [{
          metadata: {
            name: "data",
            labels: appLabels(spec, database.name, "database")
          },
          spec: claimSpec
        }]
      }
    }];
  }

  function buildIngress(spec) {
    var paths = [];
    if (spec.frontend.enabled) {
      paths.push({
        path: "/",
        pathType: "Prefix",
        backend: {
          service: {
            name: spec.frontend.name,
            port: {
              number: spec.frontend.servicePort
            }
          }
        }
      });
    }
    if (spec.backend.enabled) {
      paths.unshift({
        path: spec.frontend.enabled ? "/api" : "/",
        pathType: "Prefix",
        backend: {
          service: {
            name: spec.backend.name,
            port: {
              number: spec.backend.servicePort
            }
          }
        }
      });
    }

    var ingressSpec = {
      rules: [{
        host: spec.exposure.hostname,
        http: {
          paths: paths
        }
      }]
    };
    if (spec.exposure.ingressClassName) {
      ingressSpec.ingressClassName = spec.exposure.ingressClassName;
    }
    if (spec.exposure.tls) {
      ingressSpec.tls = [{
        hosts: [spec.exposure.hostname],
        secretName: spec.exposure.tlsSecretName
      }];
    }

    return {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: metadata(spec, spec.project.name + "-ingress", "networking"),
      spec: ingressSpec
    };
  }

  function buildHpa(spec, component, role) {
    return {
      apiVersion: "autoscaling/v2",
      kind: "HorizontalPodAutoscaler",
      metadata: metadata(spec, component.name, role),
      spec: {
        scaleTargetRef: {
          apiVersion: "apps/v1",
          kind: "Deployment",
          name: component.name
        },
        minReplicas: spec.options.hpa.minReplicas,
        maxReplicas: spec.options.hpa.maxReplicas,
        metrics: [{
          type: "Resource",
          resource: {
            name: "cpu",
            target: {
              type: "Utilization",
              averageUtilization: spec.options.hpa.cpuTarget
            }
          }
        }]
      }
    };
  }

  function buildPdb(spec, component, role) {
    return {
      apiVersion: "policy/v1",
      kind: "PodDisruptionBudget",
      metadata: metadata(spec, component.name, role),
      spec: {
        minAvailable: 1,
        selector: {
          matchLabels: selectorLabels(spec, component.name, role)
        }
      }
    };
  }

  function rawBuildResources(spec) {
    var resources = [];
    var components = [{
      value: spec.backend,
      role: "backend"
    }, {
      value: spec.frontend,
      role: "frontend"
    }];

    if (spec.project.createNamespace) {
      resources.push({
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name: spec.project.namespace,
          labels: {
            "app.kubernetes.io/instance": spec.project.name,
            "app.kubernetes.io/managed-by": "kube-manifest-pilot"
          }
        }
      });
    }

    components.forEach(function (entry) {
      if (entry.value.enabled && Object.keys(entry.value.configValues).length > 0) {
        resources.push(buildConfigMap(spec, entry.value, entry.role));
      }
    });

    if (spec.database.mode === "internal") {
      resources = resources.concat(buildPostgresResources(spec));
    }

    components.forEach(function (entry) {
      if (entry.value.enabled) {
        resources.push(buildDeployment(spec, entry.value, entry.role));
        resources.push(buildService(spec, entry.value, entry.role));
      }
    });

    if (spec.exposure.mode === "ingress") {
      resources.push(buildIngress(spec));
    }

    components.forEach(function (entry) {
      if (!entry.value.enabled) {
        return;
      }
      if (spec.options.hpa.enabled) {
        resources.push(buildHpa(spec, entry.value, entry.role));
      }
      if (spec.options.createPdb) {
        resources.push(buildPdb(spec, entry.value, entry.role));
      }
    });

    return resources;
  }

  function shallowEqual(left, right) {
    var leftKeys = Object.keys(left || {}).sort();
    var rightKeys = Object.keys(right || {}).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every(function (key, index) {
      return key === rightKeys[index] && left[key] === right[key];
    });
  }

  function assertResourceIntegrity(resources) {
    var workloads = {};
    var duplicates = duplicateResourceIdentities(resources);

    if (duplicates.length > 0) {
      throw new Error(
        "Generated resources contain duplicate identity: " + duplicates[0].identity +
        " (indexes " + duplicates[0].firstIndex + " and " + duplicates[0].duplicateIndex + ")."
      );
    }

    resources.forEach(function (resource) {
      if (resource.kind === "Deployment" || resource.kind === "StatefulSet") {
        var selector = resource.spec.selector.matchLabels;
        var podLabels = resource.spec.template.metadata.labels;
        if (!shallowEqual(selector, podLabels)) {
          throw new Error(resource.kind + "/" + resource.metadata.name + " selector and Pod labels do not match.");
        }
        workloads[resource.metadata.namespace + "/" + resource.metadata.name] = resource;
      }
    });

    resources.forEach(function (resource) {
      var matchingWorkload;
      if (resource.kind !== "Service") {
        return;
      }
      Object.keys(workloads).some(function (key) {
        var workload = workloads[key];
        if (workload.metadata.namespace === resource.metadata.namespace &&
            shallowEqual(workload.spec.selector.matchLabels, resource.spec.selector)) {
          matchingWorkload = workload;
          return true;
        }
        return false;
      });
      if (!matchingWorkload) {
        throw new Error("Service/" + resource.metadata.name + " selector does not match a generated workload.");
      }
      resource.spec.ports.forEach(function (servicePort) {
        var containers = matchingWorkload.spec.template.spec.containers;
        var matched = containers.some(function (container) {
          return container.ports.some(function (containerPort) {
            return servicePort.targetPort === containerPort.name ||
              servicePort.targetPort === containerPort.containerPort;
          });
        });
        if (!matched) {
          throw new Error("Service/" + resource.metadata.name + " targetPort does not match a generated container port.");
        }
      });
    });
  }

  function buildResources(input) {
    var report = assertValid(input);
    var resources = rawBuildResources(report.spec);
    assertResourceIntegrity(resources);
    return resources;
  }

  var KEY_ORDER = [
    "apiVersion", "kind", "metadata", "name", "namespace", "labels", "annotations",
    "spec", "data", "type", "replicas", "serviceName", "selector", "matchLabels",
    "template", "containers", "initContainers", "imagePullSecrets", "securityContext",
    "containers", "image", "imagePullPolicy", "command", "args", "ports", "containerPort",
    "protocol", "envFrom", "env", "value", "valueFrom", "secretKeyRef", "configMapRef",
    "readinessProbe", "livenessProbe", "startupProbe", "httpGet", "tcpSocket", "exec",
    "path", "port", "resources", "requests", "limits", "volumeMounts", "volumes",
    "volumeClaimTemplates", "accessModes", "storageClassName", "storage", "clusterIP",
    "publishNotReadyAddresses", "targetPort", "rules", "host", "http", "paths", "pathType",
    "backend", "service", "ingressClassName", "tls", "hosts", "secretName",
    "scaleTargetRef", "minReplicas", "maxReplicas", "metrics", "resource", "target",
    "averageUtilization", "minAvailable"
  ];
  var KEY_RANK = {};
  KEY_ORDER.forEach(function (key, index) {
    if (!own(KEY_RANK, key)) {
      KEY_RANK[key] = index;
    }
  });

  function sortedKeys(object) {
    return Object.keys(object).sort(function (left, right) {
      var leftRank = own(KEY_RANK, left) ? KEY_RANK[left] : KEY_ORDER.length;
      var rightRank = own(KEY_RANK, right) ? KEY_RANK[right] : KEY_ORDER.length;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return left.localeCompare(right);
    });
  }

  function isScalar(value) {
    return value === null || ["string", "number", "boolean"].indexOf(typeof value) !== -1;
  }

  function yamlScalar(value) {
    if (value === null) {
      return "null";
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw new TypeError("YAML serializer does not support non-finite numbers.");
      }
      return String(value);
    }
    /*
     * Always quote JavaScript strings. Besides making the output independent
     * from a parser's YAML 1.1/1.2 mode, this prevents values such as .nan,
     * .inf, 1e3, 0o77, yes and null from changing type in a ConfigMap.
     */
    return JSON.stringify(value);
  }

  function indentation(size) {
    return new Array(size + 1).join(" ");
  }

  function yamlKey(key) {
    return /^[A-Za-z0-9_.\/-]+$/.test(key) ? key : JSON.stringify(key);
  }

  function emitMappingEntry(key, value, indent) {
    var prefix = indentation(indent) + yamlKey(key) + ":";
    if (isScalar(value)) {
      return [prefix + " " + yamlScalar(value)];
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return [prefix + " []"];
      }
      return [prefix].concat(emitSequence(value, indent + 2));
    }
    if (isObject(value)) {
      if (Object.keys(value).length === 0) {
        return [prefix + " {}"];
      }
      return [prefix].concat(emitMapping(value, indent + 2));
    }
    throw new TypeError("Unsupported YAML value for key " + key + ".");
  }

  function emitMapping(object, indent) {
    var lines = [];
    sortedKeys(object).forEach(function (key) {
      if (object[key] !== undefined) {
        lines = lines.concat(emitMappingEntry(key, object[key], indent));
      }
    });
    return lines;
  }

  function emitSequence(array, indent) {
    var lines = [];
    array.forEach(function (value) {
      var prefix = indentation(indent) + "-";
      if (isScalar(value)) {
        lines.push(prefix + " " + yamlScalar(value));
        return;
      }
      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(prefix + " []");
        } else {
          lines.push(prefix);
          lines = lines.concat(emitSequence(value, indent + 2));
        }
        return;
      }
      if (isObject(value)) {
        var keys = sortedKeys(value);
        var firstKey;
        var firstValue;
        if (keys.length === 0) {
          lines.push(prefix + " {}");
          return;
        }
        firstKey = keys.shift();
        firstValue = value[firstKey];
        if (isScalar(firstValue)) {
          lines.push(prefix + " " + yamlKey(firstKey) + ": " + yamlScalar(firstValue));
        } else if (Array.isArray(firstValue) && firstValue.length === 0) {
          lines.push(prefix + " " + yamlKey(firstKey) + ": []");
        } else if (isObject(firstValue) && Object.keys(firstValue).length === 0) {
          lines.push(prefix + " " + yamlKey(firstKey) + ": {}");
        } else {
          lines.push(prefix + " " + yamlKey(firstKey) + ":");
          lines = lines.concat(Array.isArray(firstValue) ?
            emitSequence(firstValue, indent + 4) :
            emitMapping(firstValue, indent + 4));
        }
        keys.forEach(function (key) {
          if (value[key] !== undefined) {
            lines = lines.concat(emitMappingEntry(key, value[key], indent + 2));
          }
        });
        return;
      }
      throw new TypeError("Unsupported YAML sequence value.");
    });
    return lines;
  }

  function serializeYaml(resources) {
    var documents = Array.isArray(resources) ? resources : [resources];
    if (documents.length === 0) {
      return "";
    }
    return documents.map(function (document) {
      if (!isObject(document)) {
        throw new TypeError("Each YAML document must be a plain object.");
      }
      return emitMapping(document, 0).join("\n");
    }).join("\n---\n") + "\n";
  }

  function scanGeneratedPlaceholders(value, path, matches) {
    if (typeof value === "string") {
      if (hasPlaceholder(value)) {
        matches.push(path);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(function (entry, index) {
        scanGeneratedPlaceholders(entry, path + "[" + index + "]", matches);
      });
      return;
    }
    if (isObject(value)) {
      Object.keys(value).forEach(function (key) {
        scanGeneratedPlaceholders(value[key], path ? path + "." + key : key, matches);
      });
    }
  }

  function generateManifest(input) {
    var report = assertValid(input);
    var resources = rawBuildResources(report.spec);
    var placeholders = [];
    var yaml;

    assertResourceIntegrity(resources);
    scanGeneratedPlaceholders(resources, "", placeholders);
    if (placeholders.length > 0) {
      throw new Error("Generated resources contain unresolved placeholders: " + placeholders.join(", "));
    }
    yaml = serializeYaml(resources);

    return yaml;
  }

  function resourceNames(resources, kind) {
    return resources.filter(function (resource) {
      return resource.kind === kind;
    }).map(function (resource) {
      return resource.metadata.name;
    });
  }

  function unique(values) {
    var seen = {};
    return values.filter(function (value) {
      if (!value || seen[value]) {
        return false;
      }
      seen[value] = true;
      return true;
    });
  }

  function referencedSecrets(spec) {
    var references = [];
    [spec.frontend, spec.backend].forEach(function (component) {
      if (!component.enabled) {
        return;
      }
      if (component.imagePullSecret) {
        references.push({
          name: component.imagePullSecret,
          keys: [],
          purpose: "Image Pull Secret"
        });
      }
      component.env.forEach(function (entry) {
        if (entry.secretRef) {
          references.push({
            name: entry.secretRef.name,
            keys: [entry.secretRef.key],
            purpose: component.name + " 環境變數"
          });
        }
      });
    });
    if (spec.database.mode !== "none") {
      var keys = [spec.database.passwordKey];
      if (spec.project.environment === "PRODUCTION") {
        keys.push(spec.database.userKey, spec.database.databaseKey);
      }
      if (spec.database.mode === "external" && spec.database.hostKey) {
        keys.push(spec.database.hostKey);
      }
      references.push({
        name: spec.database.secretName,
        keys: unique(keys),
        purpose: "PostgreSQL 連線"
      });
    }
    if (spec.exposure.tls) {
      references.push({
        name: spec.exposure.tlsSecretName,
        keys: ["tls.crt", "tls.key"],
        purpose: "Ingress TLS"
      });
    }

    var merged = {};
    references.forEach(function (reference) {
      if (!merged[reference.name]) {
        merged[reference.name] = {
          name: reference.name,
          keys: [],
          purposes: []
        };
      }
      merged[reference.name].keys = unique(merged[reference.name].keys.concat(reference.keys));
      merged[reference.name].purposes = unique(merged[reference.name].purposes.concat([reference.purpose]));
    });
    return Object.keys(merged).sort().map(function (name) {
      return merged[name];
    });
  }

  function addCode(lines, commands) {
    lines.push("");
    lines.push(FENCE + "bash");
    commands.forEach(function (command) {
      lines.push(command);
    });
    lines.push(FENCE);
  }

  function generalRemovalCommands(resources, namespace) {
    var deletableKinds = [{
      kind: "Ingress",
      cliName: "ingress"
    }, {
      kind: "HorizontalPodAutoscaler",
      cliName: "horizontalpodautoscaler"
    }, {
      kind: "PodDisruptionBudget",
      cliName: "poddisruptionbudget"
    }, {
      kind: "Deployment",
      cliName: "deployment"
    }, {
      kind: "StatefulSet",
      cliName: "statefulset"
    }, {
      kind: "Service",
      cliName: "service"
    }, {
      kind: "ConfigMap",
      cliName: "configmap"
    }];
    var commands = [];

    deletableKinds.forEach(function (deletable) {
      resources.filter(function (resource) {
        return resource.kind === deletable.kind;
      }).forEach(function (resource) {
        commands.push(
          "kubectl --namespace " + namespace + " delete " +
          deletable.cliName + "/" + resource.metadata.name
        );
      });
    });
    return commands;
  }

  function generateTutorial(input, providedResources) {
    var report = assertValid(input);
    var spec = report.spec;
    var resources = providedResources || rawBuildResources(spec);
    var namespace = spec.project.namespace;
    var filename = spec.project.name + "-kubernetes.yaml";
    var deployments = resourceNames(resources, "Deployment");
    var statefulSets = resourceNames(resources, "StatefulSet");
    var services = resourceNames(resources, "Service");
    var secrets = referencedSecrets(spec);
    var lines = [];
    var exposed = exposedRole(spec);
    var target = exposed ? spec[exposed] : null;
    var rolloutCommands = [];
    var logCommands = [];

    assertResourceIntegrity(resources);

    lines.push("# " + spec.project.name + " Kubernetes 部署教學");
    lines.push("");
    lines.push("此教學由 KubeManifestPilot 根據問卷內容產生，所有資源名稱與命令均對應 " + TICK + filename + TICK + "。");
    lines.push("產生器只做本機規則檢查，不會連線、修改或宣稱已驗證任何 Kubernetes 叢集。");
    lines.push("");
    lines.push("## 1. 架構摘要與限制");
    lines.push("");
    lines.push("- Namespace：" + TICK + namespace + TICK);
    lines.push("- 環境：" + TICK + spec.project.environment + TICK);
    lines.push("- Deployment：" + (deployments.length ? deployments.map(function (name) { return TICK + name + TICK; }).join("、") : "無"));
    lines.push("- StatefulSet：" + (statefulSets.length ? statefulSets.map(function (name) { return TICK + name + TICK; }).join("、") : "無"));
    lines.push("- Service：" + (services.length ? services.map(function (name) { return TICK + name + TICK; }).join("、") : "無"));
    lines.push("- 對外方式：" + TICK + spec.exposure.mode + TICK);
    if (spec.database.mode === "internal") {
      lines.push("- 內建 PostgreSQL 固定為單副本、非 HA，且不包含自動備份、故障切換或災難復原。");
      lines.push("- StatefulSet 建立的 PVC 預設不會因刪除 StatefulSet 而移除。");
    }
    if (spec.database.mode === "external") {
      lines.push("- 外部 PostgreSQL 由使用者管理；本檔不建立、備份或檢查該資料庫。");
    }
    if (spec.options.hpa.enabled) {
      lines.push("- HPA 需要叢集已有可用的 Resource Metrics API。");
    }

    lines.push("");
    lines.push("## 2. 確認 Context、Namespace 與權限");
    lines.push("");
    lines.push("先確認目前 Context 是預期的叢集；以下命令只讀取狀態。");
    addCode(lines, [
      "kubectl config current-context",
      "kubectl cluster-info",
      "kubectl get namespace " + namespace,
      "kubectl auth can-i create deployments.apps --namespace " + namespace,
      "kubectl auth can-i create services --namespace " + namespace
    ]);
    if (spec.project.createNamespace) {
      lines.push("");
      lines.push("若 Namespace 尚不存在，Manifest 內的 Namespace Resource 會在套用時建立它。");
    } else {
      lines.push("");
      lines.push("問卷選擇不建立 Namespace，因此部署前必須確認 " + TICK + namespace + TICK + " 已存在。");
    }

    lines.push("");
    lines.push("## 3. 外部前提");
    lines.push("");
    if (spec.database.mode === "internal") {
      lines.push("- 叢集必須有可動態供應 " + TICK + spec.database.pvcSize + TICK + " ReadWriteOnce PVC 的 StorageClass。");
      addCode(lines, ["kubectl get storageclass"]);
    }
    if (spec.database.mode === "external") {
      lines.push("- 確認 Pod 網路可連線到外部 PostgreSQL 的 " + TICK + spec.database.port + TICK + " Port。");
    }
    if (spec.exposure.mode === "ingress") {
      lines.push("- 先安裝並設定 Ingress Controller、DNS；本工具只產生 Ingress Resource。");
      addCode(lines, ["kubectl get ingressclass"]);
    }
    if (spec.exposure.mode === "loadbalancer") {
      lines.push("- 叢集或雲端供應商必須支援 Service type LoadBalancer。");
    }
    if (spec.options.hpa.enabled) {
      addCode(lines, ["kubectl get --raw /apis/metrics.k8s.io/v1beta1"]);
    }
    if (spec.database.mode === "none" && spec.exposure.mode === "clusterip" && !spec.options.hpa.enabled) {
      lines.push("- 此設定沒有額外的 Controller、CRD 或外部資料庫前提。");
    }

    lines.push("");
    lines.push("## 4. 確認既有 Secret");
    lines.push("");
    lines.push("Manifest 不包含 Secret 值，也不會替你建立憑證。請在部署前以安全流程建立或同步下列 Secret。");
    if (secrets.length === 0) {
      lines.push("");
      lines.push("此設定沒有引用既有 Secret。");
    } else {
      secrets.forEach(function (reference) {
        lines.push("");
        lines.push("- " + TICK + reference.name + TICK + "（" + reference.purposes.join("、") + "）" +
          (reference.keys.length ? "，需要 Keys：" + reference.keys.map(function (key) { return TICK + key + TICK; }).join("、") : ""));
        addCode(lines, [
          "kubectl --namespace " + namespace + " get secret " + reference.name,
          "kubectl --namespace " + namespace + " describe secret " + reference.name
        ]);
      });
    }

    lines.push("");
    lines.push("## 5. Client 與 Server dry-run");
    lines.push("");
    lines.push("Client dry-run 可先檢查本機序列化與基本結構；Server dry-run 才會經過目標叢集的 API discovery、schema 與 admission。");
    addCode(lines, [
      "kubectl apply --dry-run=client --validate=true --filename " + filename,
      "kubectl apply --dry-run=server --validate=true --filename " + filename
    ]);

    lines.push("");
    lines.push("## 6. 部署順序");
    lines.push("");
    lines.push("Manifest 已固定排列為 Namespace、ConfigMap、儲存與 PostgreSQL、Backend、Frontend、Ingress、HPA/PDB。套用同一檔案即可保留此順序。");
    addCode(lines, ["kubectl apply --filename " + filename]);
    if (statefulSets.length > 0) {
      statefulSets.forEach(function (name) {
        rolloutCommands.push("kubectl --namespace " + namespace + " rollout status statefulset/" + name + " --timeout=5m");
      });
    }
    deployments.forEach(function (name) {
      rolloutCommands.push("kubectl --namespace " + namespace + " rollout status deployment/" + name + " --timeout=5m");
    });
    if (rolloutCommands.length > 0) {
      addCode(lines, rolloutCommands);
    }

    lines.push("");
    lines.push("## 7. 驗證資源與連線");
    addCode(lines, [
      "kubectl --namespace " + namespace + " get pods,services,endpointslices,persistentvolumeclaims,ingresses,horizontalpodautoscalers,poddisruptionbudgets",
      "kubectl --namespace " + namespace + " get events --sort-by=.lastTimestamp"
    ]);
    if (spec.exposure.mode === "clusterip") {
      if (target) {
        lines.push("");
        lines.push("ClusterIP 不會直接對外開放。用以下命令暫時從本機連線：");
        addCode(lines, [
          "kubectl --namespace " + namespace + " port-forward service/" + target.name + " " + target.servicePort + ":" + target.servicePort
        ]);
      } else if (spec.database.mode === "internal") {
        lines.push("");
        lines.push("以下命令只在本機建立臨時 PostgreSQL 通道，請勿直接暴露到公網：");
        addCode(lines, [
          "kubectl --namespace " + namespace + " port-forward service/" + spec.database.name + " " + spec.database.port + ":" + spec.database.port
        ]);
      }
    } else if (spec.exposure.mode === "ingress") {
      lines.push("");
      lines.push("確認 DNS 指向 Ingress Controller，再存取 " +
        TICK + (spec.exposure.tls ? "https://" : "http://") + spec.exposure.hostname + TICK + "。");
      addCode(lines, ["kubectl --namespace " + namespace + " describe ingress " + spec.project.name + "-ingress"]);
    } else if (target) {
      lines.push("");
      lines.push("等待 LoadBalancer 取得外部位址：");
      addCode(lines, ["kubectl --namespace " + namespace + " get service " + target.name + " --watch"]);
    }

    lines.push("");
    lines.push("## 8. Logs、Events 與除錯");
    deployments.forEach(function (name) {
      logCommands.push("kubectl --namespace " + namespace + " logs deployment/" + name + " --all-containers --tail=200");
      logCommands.push("kubectl --namespace " + namespace + " describe deployment " + name);
    });
    statefulSets.forEach(function (name) {
      logCommands.push("kubectl --namespace " + namespace + " logs statefulset/" + name + " --all-containers --tail=200");
      logCommands.push("kubectl --namespace " + namespace + " describe statefulset " + name);
    });
    logCommands.push("kubectl --namespace " + namespace + " get events --sort-by=.lastTimestamp");
    addCode(lines, logCommands);
    lines.push("");
    lines.push("若 Service 沒有 EndpointSlice，請比對 Service selector 與 Pod labels，並確認 Pod 已 Ready。");

    lines.push("");
    lines.push("## 9. Rollback");
    lines.push("");
    lines.push("Deployment 與 StatefulSet 可回復 Controller revision；資料庫 schema 與 PVC 內容不會隨 Controller rollback 自動還原。");
    var rollbackCommands = [];
    deployments.forEach(function (name) {
      rollbackCommands.push("kubectl --namespace " + namespace + " rollout history deployment/" + name);
      rollbackCommands.push("kubectl --namespace " + namespace + " rollout undo deployment/" + name);
    });
    statefulSets.forEach(function (name) {
      rollbackCommands.push("kubectl --namespace " + namespace + " rollout history statefulset/" + name);
      rollbackCommands.push("kubectl --namespace " + namespace + " rollout undo statefulset/" + name);
    });
    if (rollbackCommands.length > 0) {
      addCode(lines, rollbackCommands);
    } else {
      lines.push("");
      lines.push("此設定沒有可執行 rollout undo 的工作負載。");
    }

    lines.push("");
    lines.push("## 10. 一般移除");
    lines.push("");
    lines.push("以下命令只逐一刪除此產生器建立的工作負載、網路與設定資源，刻意保留 Namespace 與 PVC。");
    lines.push("StatefulSet 建立的 PVC 仍會保留，以避免一般移除流程意外刪除資料。");
    addCode(lines, generalRemovalCommands(resources, namespace));

    lines.push("");
    lines.push("## 11. PVC 與 Namespace 永久刪除警告");
    lines.push("");
    lines.push("以下操作可能永久刪除資料。先確認備份與 Resource 名稱，且不要直接複製執行到不確定的 Context。");
    if (spec.database.mode === "internal") {
      addCode(lines, [
        "kubectl --namespace " + namespace + " get persistentvolumeclaim data-" + spec.database.name + "-0",
        "kubectl --namespace " + namespace + " delete persistentvolumeclaim data-" + spec.database.name + "-0"
      ]);
    }
    lines.push("");
    lines.push("刪除 Namespace 會刪除其中所有 namespaced resources，不只限於此工具產生的項目。只有在 " +
      TICK + namespace + TICK + " 是專用 Namespace 且已完成備份時才考慮執行：");
    addCode(lines, [
      "kubectl get namespace " + namespace,
      "kubectl delete namespace " + namespace
    ]);

    return lines.join("\n") + "\n";
  }

  function sanitizeQuestionnaire(value, parentKey) {
    var unsafeKeys = {
      password: true,
      token: true,
      kubeconfig: true,
      privatekey: true,
      clientsecret: true,
      secretvalue: true,
      apikey: true
    };

    if (Array.isArray(value)) {
      var sensitiveIndexes = (parentKey === "command" || parentKey === "args") ?
        sensitiveCommandIndexes(value.map(String)) :
        {};
      return value.map(function (entry, index) {
        if (sensitiveIndexes[index]) {
          return "[sensitive value removed]";
        }
        return sanitizeQuestionnaire(entry, parentKey);
      }).filter(function (entry) {
        return entry !== undefined;
      });
    }
    if (typeof value === "string" && hasPlaceholder(value)) {
      return "[unresolved placeholder removed]";
    }
    if (!isObject(value)) {
      return value;
    }

    if (parentKey === "env" && isSensitiveName(value.name) && own(value, "value")) {
      return {
        name: value.name,
        redacted: true
      };
    }

    var result = {};
    Object.keys(value).sort().forEach(function (key) {
      var normalizedKey = key.toLowerCase().replace(/[_-]/g, "");
      var sensitiveConfigEntry = (parentKey === "configValues" || parentKey === "config") && isSensitiveName(key);
      if (!unsafeKeys[normalizedKey] && !sensitiveConfigEntry && !hasPlaceholder(key)) {
        result[key] = sanitizeQuestionnaire(value[key], key);
      }
    });
    return result;
  }

  function redactCrossFieldCommandValues(component) {
    var command = Array.isArray(component.command) ? component.command : [];
    var args = Array.isArray(component.args) ? component.args : [];
    var combined = command.concat(args);
    var sensitiveIndexes = sensitiveCommandIndexes(combined.map(String));

    Object.keys(sensitiveIndexes).forEach(function (indexText) {
      var index = Number(indexText);
      if (index < command.length) {
        command[index] = "[sensitive value removed]";
      } else {
        args[index - command.length] = "[sensitive value removed]";
      }
    });
  }

  function stableSortObject(value) {
    if (Array.isArray(value)) {
      return value.map(stableSortObject);
    }
    if (!isObject(value)) {
      return value;
    }
    var result = {};
    Object.keys(value).sort().forEach(function (key) {
      result[key] = stableSortObject(value[key]);
    });
    return result;
  }

  function stableStringify(value, spacing) {
    return JSON.stringify(stableSortObject(value), null, spacing === undefined ? 2 : spacing);
  }

  function generateQuestionnaireJson(input) {
    var normalized = normalizeSpec(input);
    var safe = sanitizeQuestionnaire(normalized, "");
    redactCrossFieldCommandValues(safe.frontend);
    redactCrossFieldCommandValues(safe.backend);
    return stableStringify(safe, 2) + "\n";
  }

  return Object.freeze({
    version: ENGINE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    templates: Object.freeze(Object.keys(TEMPLATE_PRESETS)),
    KubeManifestPilotValidationError: KubeManifestPilotValidationError,
    ManifestPilotValidationError: KubeManifestPilotValidationError,
    normalizeSpec: normalizeSpec,
    validateSpec: validateSpec,
    buildResources: buildResources,
    serializeYaml: serializeYaml,
    generateManifest: generateManifest,
    generateTutorial: generateTutorial,
    generateQuestionnaireJson: generateQuestionnaireJson
  });
}));
