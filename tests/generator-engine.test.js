"use strict";

var assert = require("assert");
var engine = require("../assets/js/generator-engine.js");

function resource(resources, kind, name) {
  return resources.find(function (entry) {
    return entry.kind === kind && entry.metadata.name === name;
  });
}

function assertSelectorIntegrity(resources) {
  resources.filter(function (entry) {
    return entry.kind === "Deployment" || entry.kind === "StatefulSet";
  }).forEach(function (workload) {
    assert.deepStrictEqual(
      workload.spec.selector.matchLabels,
      workload.spec.template.metadata.labels,
      workload.kind + "/" + workload.metadata.name + " selector must match Pod labels"
    );
  });

  resources.filter(function (entry) {
    return entry.kind === "Service";
  }).forEach(function (service) {
    var matchingWorkload = resources.find(function (entry) {
      return (entry.kind === "Deployment" || entry.kind === "StatefulSet") &&
        entry.metadata.namespace === service.metadata.namespace &&
        Object.keys(service.spec.selector).every(function (key) {
          return entry.spec.template.metadata.labels[key] === service.spec.selector[key];
        });
    });
    assert(matchingWorkload, "Service/" + service.metadata.name + " must select a workload");
    service.spec.ports.forEach(function (port) {
      var portMatches = matchingWorkload.spec.template.spec.containers.some(function (container) {
        return container.ports.some(function (containerPort) {
          return containerPort.name === port.targetPort ||
            containerPort.containerPort === port.targetPort;
        });
      });
      assert(portMatches, "Service/" + service.metadata.name + " targetPort must exist");
    });
  });
}

function testFrontendBackend() {
  var spec = {
    template: "frontend-backend",
    project: {
      name: "store-demo",
      namespace: "store-demo",
      environment: "PRODUCTION",
      createNamespace: true
    },
    frontend: {
      enabled: true,
      name: "web",
      image: "ghcr.io/example/web:1.4.0",
      containerPort: 8080,
      servicePort: 80,
      replicas: 2,
      resources: {
        cpuRequest: "50m",
        cpuLimit: "250m",
        memoryRequest: "64Mi",
        memoryLimit: "256Mi"
      },
      readiness: { enabled: true, type: "http", path: "/healthz" },
      liveness: { enabled: true, type: "http", path: "/healthz" },
      startup: { enabled: false, type: "http", path: "/healthz" },
      configValues: {
        API_BASE_PATH: "/api",
        FEATURE_FLAG: "enabled"
      },
      command: [],
      args: [],
      env: []
    },
    backend: {
      enabled: true,
      name: "api",
      image: "ghcr.io/example/api@sha256:46f4c73d71e2da7546ca9c654824dafb53f980381f852f2ef4d653837e308b04",
      containerPort: 3000,
      servicePort: 3000,
      replicas: 2,
      resources: {
        cpuRequest: "100m",
        cpuLimit: "500m",
        memoryRequest: "128Mi",
        memoryLimit: "512Mi"
      },
      readiness: { enabled: true, type: "http", path: "/ready" },
      liveness: { enabled: true, type: "http", path: "/live" },
      startup: { enabled: true, type: "tcp", path: "" },
      configValues: {},
      command: ["node"],
      args: ["server.js"],
      env: [{
        name: "SESSION_SIGNING_KEY",
        secretRef: {
          name: "api-runtime",
          key: "SESSION_SIGNING_KEY"
        }
      }]
    },
    database: {
      mode: "none"
    },
    exposure: {
      mode: "ingress",
      ingressClassName: "nginx",
      hostname: "store.example.com",
      tls: true,
      tlsSecretName: "store-tls"
    },
    options: {
      createPdb: true,
      hpa: {
        enabled: true,
        minReplicas: 2,
        maxReplicas: 6,
        cpuTarget: 70
      }
    }
  };
  var validation = engine.validateSpec(spec);
  var resources;
  var yamlOne;
  var yamlTwo;
  var tutorial;

  assert.strictEqual(validation.valid, true, JSON.stringify(validation.errors));
  assert.deepStrictEqual(validation.errors, []);
  assert(Array.isArray(validation.warnings));
  assert(Array.isArray(validation.infos));

  resources = engine.buildResources(spec);
  assert(resource(resources, "Namespace", "store-demo"));
  assert(resource(resources, "ConfigMap", "web-config"));
  assert(resource(resources, "Deployment", "web"));
  assert(resource(resources, "Deployment", "api"));
  assert(resource(resources, "Service", "web"));
  assert(resource(resources, "Service", "api"));
  assert(resource(resources, "Ingress", "store-demo-ingress"));
  assert(resource(resources, "HorizontalPodAutoscaler", "web"));
  assert(resource(resources, "HorizontalPodAutoscaler", "api"));
  assert(resource(resources, "PodDisruptionBudget", "web"));
  assert(resource(resources, "PodDisruptionBudget", "api"));
  assertSelectorIntegrity(resources);

  yamlOne = engine.generateManifest(spec);
  yamlTwo = engine.generateManifest(JSON.parse(JSON.stringify(spec)));
  assert.strictEqual(typeof yamlOne, "string");
  assert.strictEqual(yamlOne, yamlTwo, "same answers must generate byte-identical YAML");
  assert(yamlOne.indexOf('kind: "Ingress"') >= 0);
  assert(yamlOne.indexOf("CHANGE_ME") < 0);
  assert(yamlOne.indexOf("REPLACE_ME") < 0);

  tutorial = engine.generateTutorial(spec);
  assert(tutorial.indexOf("store-demo-kubernetes.yaml") >= 0);
  assert(tutorial.indexOf("deployment/web") >= 0);
  assert(tutorial.indexOf("deployment/api") >= 0);
  assert(tutorial.indexOf("store.example.com") >= 0);
  assert(tutorial.indexOf("<namespace>") < 0);
  assert(tutorial.indexOf("<deployment>") < 0);
}

function testPostgresql() {
  var spec = {
    template: "postgresql",
    project: {
      name: "orders-data",
      namespace: "orders-data",
      environment: "PRODUCTION",
      createNamespace: true
    },
    database: {
      mode: "internal",
      name: "orders-postgresql",
      image: "postgres:16.4-alpine",
      port: 5432,
      databaseName: "orders",
      user: "orders",
      pvcSize: "20Gi",
      storageClassName: "standard",
      secretName: "orders-postgresql-credentials",
      passwordKey: "POSTGRES_PASSWORD",
      userKey: "POSTGRES_USER",
      databaseKey: "POSTGRES_DB"
    },
    exposure: {
      mode: "clusterip"
    },
    options: {
      createPdb: false,
      hpa: { enabled: false }
    }
  };
  var validation = engine.validateSpec(spec);
  var resources;
  var statefulSet;
  var yaml;
  var tutorial;

  assert.strictEqual(validation.valid, true, JSON.stringify(validation.errors));
  assert(validation.warnings.some(function (entry) {
    return entry.code === "POSTGRESQL_SINGLE_REPLICA";
  }));

  resources = engine.buildResources(spec);
  statefulSet = resource(resources, "StatefulSet", "orders-postgresql");
  assert(statefulSet);
  assert(resource(resources, "Service", "orders-postgresql-headless"));
  assert(resource(resources, "Service", "orders-postgresql"));
  assert.strictEqual(statefulSet.spec.replicas, 1);
  assert.strictEqual(statefulSet.spec.serviceName, "orders-postgresql-headless");
  assert.strictEqual(statefulSet.spec.volumeClaimTemplates[0].spec.resources.requests.storage, "20Gi");
  assert.strictEqual(statefulSet.spec.volumeClaimTemplates[0].spec.storageClassName, "standard");
  assert(statefulSet.spec.template.spec.containers[0].env.every(function (entry) {
    if (entry.name === "PGDATA") {
      return true;
    }
    return entry.valueFrom && entry.valueFrom.secretKeyRef;
  }), "production PostgreSQL credentials must only use Secret refs");
  assertSelectorIntegrity(resources);

  yaml = engine.generateManifest(spec);
  assert.strictEqual(typeof yaml, "string");
  assert(yaml.indexOf('kind: "StatefulSet"') >= 0);
  assert(yaml.indexOf("volumeClaimTemplates:") >= 0);
  assert(yaml.indexOf("stringData:") < 0);
  assert(yaml.indexOf('kind: "Secret"') < 0);

  tutorial = engine.generateTutorial(spec);
  assert(tutorial.indexOf("非 HA") >= 0);
  assert(tutorial.indexOf("自動備份") >= 0);
  assert(tutorial.indexOf("故障切換") >= 0);
  assert(tutorial.indexOf("data-orders-postgresql-0") >= 0);
  assert(tutorial.indexOf("orders-postgresql-credentials") >= 0);
}

function testSensitiveDataAndProductionRules() {
  var unsafe = {
    template: "backend",
    project: {
      name: "unsafe-demo",
      namespace: "unsafe-demo",
      environment: "PRODUCTION"
    },
    backend: {
      enabled: true,
      name: "api",
      image: "example/api:latest",
      configValues: {
        API_TOKEN: "configmap-do-not-store"
      },
      command: ["sh", "--api-key"],
      args: [
        "cross-field-api-key",
        "run --token=literal-command-token",
        "--password",
        "literal-arg-password",
        "PASSWORD=literal-assignment-password",
        "$DATABASE_PASSWORD"
      ],
      env: [{
        name: "DATABASE_PASSWORD",
        value: "do-not-store"
      }]
    },
    database: {
      mode: "none",
      password: "also-do-not-store"
    }
  };
  var validation = engine.validateSpec(unsafe);
  var json = engine.generateQuestionnaireJson(unsafe);

  assert.strictEqual(validation.valid, false);
  assert(validation.errors.some(function (entry) {
    return entry.code === "PRODUCTION_LATEST_FORBIDDEN";
  }));
  assert(validation.errors.some(function (entry) {
    return entry.code === "SENSITIVE_ENV_VALUE";
  }));
  assert(validation.errors.some(function (entry) {
    return entry.code === "SENSITIVE_VALUE_NOT_ALLOWED";
  }));
  assert(validation.errors.some(function (entry) {
    return entry.code === "SENSITIVE_COMMAND_VALUE";
  }));
  assert.strictEqual(json.indexOf("do-not-store"), -1);
  assert.strictEqual(json.indexOf("also-do-not-store"), -1);
  assert.strictEqual(json.indexOf("configmap-do-not-store"), -1);
  assert.strictEqual(json.indexOf("cross-field-api-key"), -1);
  assert.strictEqual(json.indexOf("literal-command-token"), -1);
  assert.strictEqual(json.indexOf("literal-arg-password"), -1);
  assert.strictEqual(json.indexOf("literal-assignment-password"), -1);
  assert(json.indexOf("$DATABASE_PASSWORD") >= 0, "environment variable references must be preserved");
}

function testGeneratedIdentityCollision() {
  var collision = {
    template: "fullstack-postgresql",
    project: {
      name: "collision-demo",
      namespace: "collision-demo",
      environment: "DEV"
    },
    frontend: {
      enabled: true,
      name: "postgresql-headless",
      image: "nginx:1.27-alpine"
    },
    backend: {
      enabled: true,
      name: "api",
      image: "nginx:1.27-alpine"
    },
    database: {
      mode: "internal",
      name: "postgresql",
      image: "postgres:16-alpine",
      secretName: "postgresql-credentials",
      passwordKey: "POSTGRES_PASSWORD"
    }
  };
  var validation = engine.validateSpec(collision);
  var duplicate = validation.errors.find(function (entry) {
    return entry.code === "DUPLICATE_RESOURCE_IDENTITY";
  });

  assert.strictEqual(validation.valid, false);
  assert(duplicate, "generated Service identity collision must be rejected");
  assert.strictEqual(duplicate.details.apiVersion, "v1");
  assert.strictEqual(duplicate.details.kind, "Service");
  assert.strictEqual(duplicate.details.namespace, "collision-demo");
  assert.strictEqual(duplicate.details.name, "postgresql-headless");
  assert.throws(function () {
    engine.buildResources(collision);
  }, function (error) {
    return error &&
      error.name === "KubeManifestPilotValidationError" &&
      error.report.errors.some(function (entry) {
        return entry.code === "DUPLICATE_RESOURCE_IDENTITY";
      });
  });
}

function testSafeCommandEnvironmentReferences() {
  var safe = {
    template: "backend",
    project: {
      name: "safe-command",
      namespace: "safe-command",
      environment: "DEV"
    },
    backend: {
      enabled: true,
      name: "api",
      image: "example/api:1.0.0",
      command: ["sh", "-c"],
      args: [
        "exec app --password \"$DATABASE_PASSWORD\" --token=$API_TOKEN"
      ],
      env: [{
        name: "DATABASE_PASSWORD",
        secretRef: {
          name: "api-secrets",
          key: "DATABASE_PASSWORD"
        }
      }, {
        name: "API_TOKEN",
        secretRef: {
          name: "api-secrets",
          key: "API_TOKEN"
        }
      }]
    },
    database: {
      mode: "none"
    }
  };
  var validation = engine.validateSpec(safe);
  var json = engine.generateQuestionnaireJson(safe);

  assert.strictEqual(validation.valid, true, JSON.stringify(validation.errors));
  assert(json.indexOf("$DATABASE_PASSWORD") >= 0);
  assert(json.indexOf("$API_TOKEN") >= 0);
}

function testGeneralRemovalPreservesDataBoundaries() {
  var spec = {
    template: "postgresql",
    project: {
      name: "safe-remove",
      namespace: "safe-remove",
      environment: "PRODUCTION",
      createNamespace: true
    },
    database: {
      mode: "internal",
      name: "postgresql",
      image: "postgres:16.4-alpine",
      pvcSize: "10Gi",
      secretName: "postgresql-credentials",
      passwordKey: "POSTGRES_PASSWORD",
      userKey: "POSTGRES_USER",
      databaseKey: "POSTGRES_DB"
    },
    exposure: {
      mode: "clusterip"
    }
  };
  var tutorial = engine.generateTutorial(spec);
  var generalRemovalMatch = tutorial.match(/## 10\.[\s\S]*?## 11\./);
  var generalRemoval;
  var destructiveRemoval;

  assert(generalRemovalMatch, "tutorial must include bounded general-removal and destructive sections");
  generalRemoval = generalRemovalMatch[0];
  destructiveRemoval = tutorial.slice(tutorial.indexOf("## 11."));

  assert(generalRemoval.indexOf("delete --filename") < 0);
  assert(generalRemoval.indexOf("delete namespace") < 0);
  assert(generalRemoval.indexOf("delete persistentvolumeclaim") < 0);
  assert(generalRemoval.indexOf("delete pvc") < 0);
  assert(generalRemoval.indexOf("delete statefulset/postgresql") >= 0);
  assert(generalRemoval.indexOf("delete service/postgresql") >= 0);
  assert(destructiveRemoval.indexOf("delete persistentvolumeclaim data-postgresql-0") >= 0);
  assert(destructiveRemoval.indexOf("delete namespace safe-remove") >= 0);
}

function testYamlStringScalarsAreAlwaysQuoted() {
  var yaml = engine.serializeYaml({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: "implicit-scalars"
    },
    data: {
      NAN_VALUE: ".nan",
      INF_VALUE: ".inf",
      EXPONENT_VALUE: "1e3",
      OCTAL_VALUE: "0o77",
      BOOLEAN_VALUE: "yes",
      NULL_VALUE: "null",
      DATE_VALUE: "2026-08-16",
      MULTILINE_VALUE: "line one\nline two"
    }
  });

  assert(yaml.indexOf('apiVersion: "v1"') >= 0);
  assert(yaml.indexOf('kind: "ConfigMap"') >= 0);
  assert(yaml.indexOf('NAN_VALUE: ".nan"') >= 0);
  assert(yaml.indexOf('INF_VALUE: ".inf"') >= 0);
  assert(yaml.indexOf('EXPONENT_VALUE: "1e3"') >= 0);
  assert(yaml.indexOf('OCTAL_VALUE: "0o77"') >= 0);
  assert(yaml.indexOf('BOOLEAN_VALUE: "yes"') >= 0);
  assert(yaml.indexOf('NULL_VALUE: "null"') >= 0);
  assert(yaml.indexOf('DATE_VALUE: "2026-08-16"') >= 0);
  assert(yaml.indexOf('MULTILINE_VALUE: "line one\\nline two"') >= 0);
  assert.strictEqual(yaml, engine.serializeYaml({
    kind: "ConfigMap",
    data: {
      OCTAL_VALUE: "0o77",
      NAN_VALUE: ".nan",
      NULL_VALUE: "null",
      INF_VALUE: ".inf",
      DATE_VALUE: "2026-08-16",
      MULTILINE_VALUE: "line one\nline two",
      EXPONENT_VALUE: "1e3",
      BOOLEAN_VALUE: "yes"
    },
    metadata: {
      name: "implicit-scalars"
    },
    apiVersion: "v1"
  }), "mapping insertion order must not affect deterministic YAML");
}

function testEmptyConfigMapValueIsPreserved() {
  var spec = {
    template: "backend",
    project: {
      name: "empty-config",
      namespace: "empty-config",
      environment: "DEV"
    },
    backend: {
      enabled: true,
      name: "api",
      image: "example/api:1.0.0",
      configValues: {
        Z_VALUE: "last",
        EMPTY_VALUE: "",
        A_VALUE: "first"
      }
    },
    database: {
      mode: "none"
    }
  };
  var reordered = JSON.parse(JSON.stringify(spec));
  var resources = engine.buildResources(spec);
  var configMap = resource(resources, "ConfigMap", "api-config");
  var yaml = engine.generateManifest(spec);
  var questionnaire = JSON.parse(engine.generateQuestionnaireJson(spec));

  reordered.backend.configValues = {
    A_VALUE: "first",
    EMPTY_VALUE: "",
    Z_VALUE: "last"
  };

  assert(configMap);
  assert(Object.prototype.hasOwnProperty.call(configMap.data, "EMPTY_VALUE"));
  assert.strictEqual(configMap.data.EMPTY_VALUE, "");
  assert(yaml.indexOf('EMPTY_VALUE: ""') >= 0);
  assert.strictEqual(questionnaire.backend.configValues.EMPTY_VALUE, "");
  assert.strictEqual(yaml, engine.generateManifest(reordered));
  assert.strictEqual(
    engine.generateQuestionnaireJson(spec),
    engine.generateQuestionnaireJson(reordered)
  );
}

function testPlaceholderValidationMatchesGeneration() {
  var spec = {
    template: "fullstack-postgresql",
    project: {
      name: "placeholder-audit",
      namespace: "placeholder-audit",
      environment: "DEV"
    },
    frontend: {
      enabled: false
    },
    backend: {
      enabled: true,
      name: "api",
      image: "example/api:1.0.0",
      command: ["sh", "-c", "echo CHANGE_ME"],
      args: ["--mode=REPLACE_ME"],
      configValues: {
        CHANGE_ME: "value"
      },
      readiness: {
        enabled: true,
        type: "exec",
        command: ["sh", "-c", "echo TODO"]
      }
    },
    database: {
      mode: "internal",
      name: "postgresql",
      image: "postgres:16-alpine",
      databaseName: "CHANGE_ME",
      user: "REPLACE_ME",
      secretName: "change-me",
      passwordKey: "YOUR_VALUE"
    }
  };
  var validation = engine.validateSpec(spec);
  var placeholderPaths = validation.errors.filter(function (entry) {
    return entry.code === "UNRESOLVED_PLACEHOLDER";
  }).map(function (entry) {
    return entry.path;
  });
  var questionnaireJson = engine.generateQuestionnaireJson(spec);

  assert.strictEqual(validation.valid, false);
  [
    "backend.command[2]",
    "backend.args[0]",
    "backend.configValues.CHANGE_ME",
    "backend.readiness.command[2]",
    "database.databaseName",
    "database.user",
    "database.secretName",
    "database.passwordKey"
  ].forEach(function (path) {
    assert(placeholderPaths.indexOf(path) >= 0, "missing placeholder validation path " + path);
  });
  assert(!/(?:CHANGE[_-]?ME|REPLACE[_-]?ME|YOUR[_-]VALUE|\bTODO\b)/i.test(questionnaireJson));
  assert.throws(function () {
    engine.generateManifest(spec);
  }, function (error) {
    return error &&
      error.name === "KubeManifestPilotValidationError" &&
      error.report.errors.some(function (entry) {
        return entry.code === "UNRESOLVED_PLACEHOLDER";
      });
  });
}

testFrontendBackend();
testPostgresql();
testSensitiveDataAndProductionRules();
testGeneratedIdentityCollision();
testSafeCommandEnvironmentReferences();
testGeneralRemovalPreservesDataBoundaries();
testYamlStringScalarsAreAlwaysQuoted();
testEmptyConfigMapValueIsPreserved();
testPlaceholderValidationMatchesGeneration();

console.log("generator-engine: all tests passed");
