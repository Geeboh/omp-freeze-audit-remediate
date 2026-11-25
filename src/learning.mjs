import { hash, redact, requireThat, text, now } from './io.mjs';

export const LEARNING_SCHEMA_VERSION = 1;
export const DEFAULT_LEARNING = Object.freeze({
  schemaVersion: LEARNING_SCHEMA_VERSION,
  enabled: false,
  localOnly: true,
  maxObservations: 256,
  maxLessons: 64,
  maxRootCauses: 64,
  observations: [],
  lessons: [],
  rootCauses: [],
  noesis: { status: 'unavailable', reason: 'No verified NOESIS interface is configured.' },
  exports: [],
});

const clean = (value, label, max = 2000) => { requireThat(value !== undefined && value !== null, `${label} is required`); return redact(text(String(value), label, max)); };
const refs = (value, label) => [...new Set((value ?? []).map(ref => clean(ref, label, 300)))];
const copy = value => structuredClone(value);

export function createLearningState(input = {}) {
  return {
    ...copy(DEFAULT_LEARNING),
    ...input,
    observations: [...(input.observations ?? [])],
    lessons: [...(input.lessons ?? [])],
    rootCauses: [...(input.rootCauses ?? [])],
    exports: [...(input.exports ?? [])],
    noesis: { ...DEFAULT_LEARNING.noesis, ...(input.noesis ?? {}) },
  };
}

export function recordObservation(learning, input, context = {}) {
  requireThat(learning.localOnly === true, 'Learning must remain local-only', 'LEARNING_SCOPE');
  if (!learning.enabled) return { learning, recorded: false, reason: 'disabled' };
  requireThat(learning.observations.length < learning.maxObservations, 'Learning observation limit reached', 'LEARNING_LIMIT');
  const record = {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    runId: clean(context.runId ?? input.runId, 'runId', 200),
    taskId: input.taskId ? clean(input.taskId, 'taskId', 200) : null,
    kind: clean(input.kind ?? 'failure', 'observation kind', 100),
    claim: clean(input.claim, 'observation claim', 2000),
    actual: clean(input.actual, 'observation actual', 2000),
    hypothesis: input.hypothesis ? clean(input.hypothesis, 'observation hypothesis', 2000) : null,
    evidenceRefs: refs(input.evidenceRefs, 'evidence reference'),
    applicability: input.applicability ? clean(input.applicability, 'applicability', 1000) : 'this repository and declared run scope',
    privacy: 'local-only',
    createdAt: now(),
  };
  record.id = input.id ? clean(input.id, 'observation id', 200) : `O-${hash({ ...record, createdAt: undefined }).slice(0, 24)}`;
  const duplicate = learning.observations.find(item => item.id === record.id);
  if (duplicate) return { learning, recorded: false, duplicateOf: duplicate.id, observation: duplicate };
  return { learning: { ...learning, observations: [...learning.observations, record] }, recorded: true, observation: record };
}

export function proposeLesson(learning, input) {
  requireThat(learning.localOnly === true, 'Learning must remain local-only', 'LEARNING_SCOPE');
  requireThat(learning.lessons.length < learning.maxLessons, 'Learning lesson limit reached', 'LEARNING_LIMIT');
  const observationIds = refs(input.observationIds, 'observation id');
  requireThat(observationIds.length > 0 && observationIds.every(id => learning.observations.some(item => item.id === id)), 'Lesson needs existing observation references', 'LEARNING_EVIDENCE');
  const lesson = {
    id: input.id ? clean(input.id, 'lesson id', 200) : `L-${hash({ observationIds, claim: input.claim }).slice(0, 24)}`,
    schemaVersion: LEARNING_SCHEMA_VERSION,
    status: 'proposed',
    observationIds,
    claim: clean(input.claim, 'lesson claim', 2000),
    supportingEvidenceRefs: refs(input.supportingEvidenceRefs, 'supporting evidence reference'),
    contradictingEvidenceRefs: refs(input.contradictingEvidenceRefs, 'contradicting evidence reference'),
    applicability: clean(input.applicability ?? 'declared local scope only', 'lesson applicability', 1000),
    confidence: Number.isFinite(input.confidence) ? Math.max(0, Math.min(1, input.confidence)) : 0.5,
    privacy: 'local-only',
    createdAt: now(),
    validatedAt: null,
    validationRefs: [],
  };
  const duplicate = learning.lessons.find(item => item.id === lesson.id);
  if (duplicate) return { learning, lesson: duplicate, duplicateOf: duplicate.id };
  return { learning: { ...learning, lessons: [...learning.lessons, lesson] }, lesson };
}

export function validateLesson(learning, id, validationRefs = []) {
  const refsForValidation = refs(validationRefs, 'validation reference');
  requireThat(refsForValidation.length > 0, 'Lesson validation needs evidence references', 'LEARNING_EVIDENCE');
  const lesson = learning.lessons.find(item => item.id === id);
  requireThat(lesson, 'Unknown lesson', 'LEARNING_UNKNOWN');
  const updated = { ...lesson, status: 'validated', validatedAt: now(), validationRefs: refsForValidation };
  return { learning: { ...learning, lessons: learning.lessons.map(item => item.id === id ? updated : item) }, lesson: updated };
}

export function groupRootCause(learning, input) {
  requireThat(learning.rootCauses.length < learning.maxRootCauses, 'Root-cause group limit reached', 'LEARNING_LIMIT');
  const findingIds = refs(input.findingIds, 'finding id');
  requireThat(findingIds.length > 0, 'Root-cause group needs findings', 'LEARNING_EVIDENCE');
  const group = {
    id: input.id ? clean(input.id, 'root-cause id', 200) : `RC-${hash({ findingIds: [...findingIds].sort(), mechanism: input.mechanism }).slice(0, 24)}`,
    schemaVersion: LEARNING_SCHEMA_VERSION,
    findingIds,
    mechanism: clean(input.mechanism, 'root-cause mechanism', 2000),
    confidence: Number.isFinite(input.confidence) ? Math.max(0, Math.min(1, input.confidence)) : 0.5,
    evidenceRefs: refs(input.evidenceRefs, 'root-cause evidence reference'),
    status: 'proposed',
    createdAt: now(),
  };
  const duplicate = learning.rootCauses.find(item => item.id === group.id);
  if (duplicate) return { learning, group: duplicate, duplicateOf: duplicate.id };
  return { learning: { ...learning, rootCauses: [...learning.rootCauses, group] }, group };
}

export function exportLearning(learning) {
  return {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    kind: 'far-local-learning-export',
    scope: 'local-only',
    observations: learning.observations.map(({ id, schemaVersion, runId, taskId, kind, claim, actual, hypothesis, evidenceRefs, applicability, privacy, createdAt }) => ({ id, schemaVersion, runId, taskId, kind, claim, actual, hypothesis, evidenceRefs, applicability, privacy, createdAt })),
    lessons: learning.lessons.map(({ id, schemaVersion, status, observationIds, claim, supportingEvidenceRefs, contradictingEvidenceRefs, applicability, confidence, privacy, createdAt, validatedAt, validationRefs }) => ({ id, schemaVersion, status, observationIds, claim, supportingEvidenceRefs, contradictingEvidenceRefs, applicability, confidence, privacy, createdAt, validatedAt, validationRefs })),
    rootCauses: learning.rootCauses.map(({ id, schemaVersion, findingIds, mechanism, confidence, evidenceRefs, status, createdAt }) => ({ id, schemaVersion, findingIds, mechanism, confidence, evidenceRefs, status, createdAt })),
    noesis: { status: learning.noesis.status, reason: learning.noesis.reason },
    exportedAt: now(),
  };
}
