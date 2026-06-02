'use strict';
/**
 * Integration-style unit tests for git-manager.js (the save/timeline system).
 *
 * Strategy: load the script via new Function('window', 'require', code) so
 * it can call require() for path/fs/child_process while binding window.* to
 * our local W object. Each test group gets a fresh temp directory so git repos
 * don't interfere with each other. The iceTimeline.refresh mock is used as the
 * completion signal for async git operations.
 *
 * Running: cd tests/suite && npm test -- git-manager
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '../../..');
const W = {};

/* eslint-disable no-new-func */
function loadScript(relPath) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  new Function('window', 'require', code)(W, require);
}
/* eslint-enable no-new-func */

jest.setTimeout(20000);

// ── Helpers ───────────────────────────────────────────────────────────────────

function waitForRefresh() {
  return new Promise(function (resolve) {
    W.iceTimeline.refresh.mockImplementationOnce(resolve);
  });
}

function getLog() {
  return new Promise(function (resolve) {
    W.iceGitManager.getLog(function (err, commits) {
      resolve(commits || []);
    });
  });
}

function getHead() {
  return new Promise(function (resolve) {
    W.iceGitManager.getHead(function (hash) {
      resolve(hash);
    });
  });
}

function listBranches() {
  return new Promise(function (resolve) {
    W.iceGitManager.listBranches(function (err, branches) {
      resolve(branches || []);
    });
  });
}

function getHidden() {
  return new Promise(function (resolve) {
    W.iceGitManager.getHiddenBranches(function (err, list) {
      resolve(list || []);
    });
  });
}

// Create a temp dir with a minimal .ice file, return the full filepath.
function makeTempFile(suffix) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ice-save-test-'));
  var filepath = path.join(dir, (suffix || 'project') + '.ice');
  fs.writeFileSync(
    filepath,
    JSON.stringify({ design: { graph: { blocks: [], wires: [] } }, version: 1 })
  );
  return { filepath: filepath, dir: dir };
}

function rmrf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {}
}

// ── One-time setup ─────────────────────────────────────────────────────────────

beforeAll(function () {
  W.iceTimeline = { refresh: jest.fn() };
  loadScript('app/scripts/services/git-manager.js');
});

// ── Save system ───────────────────────────────────────────────────────────────

describe('save system', function () {
  var filepath, dir;

  beforeEach(async function () {
    var tmp = makeTempFile('save-test');
    filepath = tmp.filepath;
    dir = tmp.dir;
    var ready = waitForRefresh();
    W.iceGitManager.setDir(filepath);
    await ready;
  });

  afterEach(function () {
    W.iceGitManager.setDir('');
    rmrf(dir);
  });

  test('new save produces a new save point', async function () {
    var before = await getLog();
    fs.writeFileSync(filepath, JSON.stringify({ version: 2 }));
    W.iceGitManager.scheduleCommit('My Save');
    var refreshed = waitForRefresh();
    W.iceGitManager.flushCommit();
    await refreshed;
    var after = await getLog();
    expect(after.length).toBe(before.length + 1);
  });

  test('save message appears as the commit subject', async function () {
    fs.writeFileSync(filepath, JSON.stringify({ version: 3 }));
    W.iceGitManager.scheduleCommit('Version 3');
    var refreshed = waitForRefresh();
    W.iceGitManager.flushCommit();
    await refreshed;
    var log = await getLog();
    expect(log[0].subject).toBe('Version 3');
  });

  test('save without file change does not produce a new save point', async function () {
    var before = await getLog();
    // File has not changed since the initial commit — nothing to stage
    W.iceGitManager.scheduleCommit('No-op');
    W.iceGitManager.flushCommit();
    // No refresh will fire because _doCommit exits early when diff is clean
    await new Promise(function (r) {
      setTimeout(r, 1000);
    });
    var after = await getLog();
    expect(after.length).toBe(before.length);
  });

  test('multiple rapid saves collapse into one save point with the last message', async function () {
    var before = await getLog();
    fs.writeFileSync(filepath, JSON.stringify({ version: 10 }));
    W.iceGitManager.scheduleCommit('Draft A');
    W.iceGitManager.scheduleCommit('Draft B');
    W.iceGitManager.scheduleCommit('Final');
    var refreshed = waitForRefresh();
    W.iceGitManager.flushCommit();
    await refreshed;
    var after = await getLog();
    expect(after.length).toBe(before.length + 1);
    expect(after[0].subject).toBe('Final');
  });

  test('setDir("") clears state so getLog returns empty immediately', async function () {
    W.iceGitManager.setDir('');
    var log = await getLog();
    expect(log).toEqual([]);
  });

  test('default save message is "Save" when none provided', async function () {
    fs.writeFileSync(filepath, JSON.stringify({ version: 4 }));
    W.iceGitManager.scheduleCommit(); // no message argument
    var refreshed = waitForRefresh();
    W.iceGitManager.flushCommit();
    await refreshed;
    var log = await getLog();
    expect(log[0].subject).toBe('Save');
  });
});

// ── Commit naming ─────────────────────────────────────────────────────────────

describe('commit naming', function () {
  var filepath, dir;

  beforeEach(async function () {
    var tmp = makeTempFile('rename-test');
    filepath = tmp.filepath;
    dir = tmp.dir;
    var ready = waitForRefresh();
    W.iceGitManager.setDir(filepath);
    await ready;
  });

  afterEach(function () {
    W.iceGitManager.setDir('');
    rmrf(dir);
  });

  test('renameCommit updates the subject of the HEAD commit', async function () {
    var head = await getHead();
    var refreshed = waitForRefresh();
    await new Promise(function (resolve) {
      W.iceGitManager.renameCommit(head, 'My Project', resolve);
    });
    await refreshed;
    var log = await getLog();
    expect(log[0].subject).toBe('My Project');
  });

  test('renameCommit stores a label override for a non-HEAD commit', async function () {
    // Create a second commit so the initial one is no longer HEAD
    fs.writeFileSync(filepath, JSON.stringify({ version: 2 }));
    W.iceGitManager.scheduleCommit('Second save');
    var r1 = waitForRefresh();
    W.iceGitManager.flushCommit();
    await r1;

    var log = await getLog();
    var initialHash = log[log.length - 1].hash; // oldest commit

    var r2 = waitForRefresh();
    await new Promise(function (resolve) {
      W.iceGitManager.renameCommit(initialHash, 'Renamed Initial', resolve);
    });
    await r2;

    var updated = await getLog();
    var found = updated.find(function (c) {
      return c.hash === initialHash;
    });
    expect(found.subject).toBe('Renamed Initial');
  });
});

// ── Branch management ─────────────────────────────────────────────────────────

describe('branch management', function () {
  var filepath, dir;

  beforeEach(async function () {
    var tmp = makeTempFile('branch-test');
    filepath = tmp.filepath;
    dir = tmp.dir;
    var ready = waitForRefresh();
    W.iceGitManager.setDir(filepath);
    await ready;
  });

  afterEach(function () {
    W.iceGitManager.setDir('');
    rmrf(dir);
  });

  test('createBranch adds a new branch visible in listBranches', async function () {
    var before = await listBranches();
    var refreshed = waitForRefresh();
    await new Promise(function (resolve) {
      W.iceGitManager.createBranch('', 'my-feature', resolve);
    });
    await refreshed;
    var after = await listBranches();
    expect(after).toContain('my-feature');
    expect(after.length).toBe(before.length + 1);
  });

  test('switchBranch moves HEAD to the target branch without changing the commit hash', async function () {
    var refreshed1 = waitForRefresh();
    await new Promise(function (resolve) {
      W.iceGitManager.createBranch('', 'alt', resolve);
    });
    await refreshed1;

    var headBefore = await getHead();

    var refreshed2 = waitForRefresh();
    await new Promise(function (resolve) {
      W.iceGitManager.switchBranch('alt', resolve);
    });
    await refreshed2;

    var headAfter = await getHead();
    expect(headAfter).toBe(headBefore);
  });

  test('deleteBranch removes a branch that is not currently checked out', async function () {
    var refreshed1 = waitForRefresh();
    await new Promise(function (resolve) {
      W.iceGitManager.createBranch('', 'temp-branch', resolve);
    });
    await refreshed1;

    var refreshed2 = waitForRefresh();
    await new Promise(function (resolve) {
      W.iceGitManager.deleteBranch('temp-branch', resolve);
    });
    await refreshed2;

    var branches = await listBranches();
    expect(branches).not.toContain('temp-branch');
  });

  test('createTag is visible in the commit refs after creation', async function () {
    var head = await getHead();
    var refreshed = waitForRefresh();
    await new Promise(function (resolve) {
      W.iceGitManager.createTag(head, 'v1.0', resolve);
    });
    await refreshed;
    var log = await getLog();
    var tagged = log.find(function (c) {
      return c.hash === head;
    });
    expect(tagged.refs).toContain('v1.0');
  });
});

// ── Merge into main ───────────────────────────────────────────────────────────

describe('mergeIntoMain', function () {
  var filepath, dir;

  beforeEach(async function () {
    var tmp = makeTempFile('merge-test');
    filepath = tmp.filepath;
    dir = tmp.dir;
    var ready = waitForRefresh();
    W.iceGitManager.setDir(filepath);
    await ready;
  });

  afterEach(function () {
    W.iceGitManager.setDir('');
    rmrf(dir);
  });

  test('getMainBranch returns the branch created at repo initialisation', async function () {
    var main = W.iceGitManager.getMainBranch();
    expect(typeof main).toBe('string');
    expect(main.length).toBeGreaterThan(0);
  });

  test('mergeIntoMain creates a merge commit on the main branch', async function () {
    var mainBranch = W.iceGitManager.getMainBranch();

    // Create a feature branch and save two commits on it
    var r1 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.createBranch('', 'feature', r);
    });
    await r1;

    var r2 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.switchBranch('feature', r);
    });
    await r2;

    fs.writeFileSync(filepath, JSON.stringify({ version: 2 }));
    W.iceGitManager.scheduleCommit('Feature work');
    var r3 = waitForRefresh();
    W.iceGitManager.flushCommit();
    await r3;

    // Merge feature into main
    var r4 = waitForRefresh();
    await new Promise(function (resolve) {
      W.iceGitManager.mergeIntoMain('feature', resolve);
    });
    await r4;

    // Log should now contain a merge commit (2 parents) on the main branch
    var log = await getLog();
    var mergeCommit = log.find(function (c) {
      return c.parents.length === 2;
    });
    expect(mergeCommit).toBeDefined();
    expect(mergeCommit.subject).toContain('feature');
    expect(mergeCommit.subject).toContain(mainBranch);
  });

  test('after mergeIntoMain HEAD is on the main branch', async function () {
    var mainBranch = W.iceGitManager.getMainBranch();

    var r1 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.createBranch('', 'feat2', r);
    });
    await r1;

    var r2 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.switchBranch('feat2', r);
    });
    await r2;

    fs.writeFileSync(filepath, JSON.stringify({ version: 3 }));
    W.iceGitManager.scheduleCommit('Feat2 work');
    var r3 = waitForRefresh();
    W.iceGitManager.flushCommit();
    await r3;

    var r4 = waitForRefresh();
    await new Promise(function (resolve) {
      W.iceGitManager.mergeIntoMain('feat2', resolve);
    });
    await r4;

    // HEAD should now be on the main branch
    var log = await getLog();
    var head = await getHead();
    var headCommit = log.find(function (c) {
      return c.hash === head;
    });
    var refs = headCommit ? headCommit.refs : '';
    expect(refs).toContain(mainBranch);
  });

  test('mergeIntoMain aborts cleanly and returns MERGE_CONFLICT when both branches diverge from the same base', async function () {
    // Setup: main has content A, explore has content B (both from same empty base)
    var log0 = await getLog();
    var baseHash = log0[log0.length - 1].hash; // initial commit

    // Advance main to content A
    fs.writeFileSync(filepath, JSON.stringify({ branch: 'main', version: 1 }));
    W.iceGitManager.scheduleCommit('Main work');
    var r1 = waitForRefresh();
    W.iceGitManager.flushCommit();
    await r1;

    // Create explore branch at the base commit and add content B there
    var rB1 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.createBranch(baseHash, 'explore-conflict', r);
    });
    await rB1;

    var rB2 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.switchBranch('explore-conflict', r);
    });
    await rB2;

    fs.writeFileSync(
      filepath,
      JSON.stringify({ branch: 'explore', version: 99 })
    );
    W.iceGitManager.scheduleCommit('Explore work');
    var r2 = waitForRefresh();
    W.iceGitManager.flushCommit();
    await r2;

    // mergeIntoMain should detect conflict, abort, and report it
    var result = await new Promise(function (resolve) {
      W.iceGitManager.mergeIntoMain('explore-conflict', resolve);
    });
    expect(result).toMatch(/^MERGE_CONFLICT:/);

    // Repo must be back to a clean state on main (no MERGE_HEAD, no conflict markers)
    var head = await getHead();
    var log = await getLog();
    var headCommit = log.find(function (c) {
      return c.hash === head;
    });
    expect(headCommit.refs).toContain(W.iceGitManager.getMainBranch());

    var content = fs.readFileSync(filepath, 'utf8');
    expect(content).not.toContain('<<<<<<<');
  });

  test('mergeKeepExplore resolves conflict by taking explore branch content', async function () {
    var log0 = await getLog();
    var baseHash = log0[log0.length - 1].hash;

    // Advance main
    fs.writeFileSync(filepath, JSON.stringify({ branch: 'main', version: 1 }));
    W.iceGitManager.scheduleCommit('Main work');
    var r1 = waitForRefresh();
    W.iceGitManager.flushCommit();
    await r1;

    // Create + populate explore branch from base
    var rB1 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.createBranch(baseHash, 'explore-keep', r);
    });
    await rB1;

    var rB2 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.switchBranch('explore-keep', r);
    });
    await rB2;

    var exploreContent = JSON.stringify({ branch: 'explore', version: 42 });
    fs.writeFileSync(filepath, exploreContent);
    W.iceGitManager.scheduleCommit('Explore keep work');
    var r2 = waitForRefresh();
    W.iceGitManager.flushCommit();
    await r2;

    // mergeKeepExplore should succeed with explore content
    var r3 = waitForRefresh();
    var err = await new Promise(function (resolve) {
      W.iceGitManager.mergeKeepExplore('explore-keep', resolve);
    });
    await r3;
    expect(err).toBeNull();

    // File content should match the explore branch
    var content = fs.readFileSync(filepath, 'utf8');
    expect(JSON.parse(content)).toEqual({ branch: 'explore', version: 42 });

    // A merge commit (2 parents) should be present
    var log = await getLog();
    var mergeCommit = log.find(function (c) {
      return c.parents.length === 2;
    });
    expect(mergeCommit).toBeDefined();
  });

  test('mergeCanvas combines blocks from both branches into one canvas', async function () {
    var log0 = await getLog();
    var baseHash = log0[log0.length - 1].hash;

    // Advance main with block A
    var mainContent = JSON.stringify({
      design: {
        graph: {
          blocks: [
            { id: 'blockA', type: 'basic.input', data: {}, position: {} },
          ],
          wires: [],
        },
      },
      dependencies: {},
    });
    fs.writeFileSync(filepath, mainContent);
    W.iceGitManager.scheduleCommit('Main adds block A');
    var r1 = waitForRefresh();
    W.iceGitManager.flushCommit();
    await r1;

    // Create explore branch at base and add block B there
    var rB1 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.createBranch(baseHash, 'explore-canvas', r);
    });
    await rB1;

    var rB2 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.switchBranch('explore-canvas', r);
    });
    await rB2;

    var exploreContent = JSON.stringify({
      design: {
        graph: {
          blocks: [
            { id: 'blockB', type: 'basic.output', data: {}, position: {} },
          ],
          wires: [],
        },
      },
      dependencies: {},
    });
    fs.writeFileSync(filepath, exploreContent);
    W.iceGitManager.scheduleCommit('Explore adds block B');
    var r2 = waitForRefresh();
    W.iceGitManager.flushCommit();
    await r2;

    // mergeCanvas should combine both blocks
    var r3 = waitForRefresh();
    var err = await new Promise(function (resolve) {
      W.iceGitManager.mergeCanvas('explore-canvas', resolve);
    });
    await r3;
    expect(err).toBeNull();

    // File on disk should contain both block A and block B
    var merged = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    var ids = merged.design.graph.blocks.map(function (b) {
      return b.id;
    });
    expect(ids).toContain('blockA');
    expect(ids).toContain('blockB');

    // A merge commit (2 parents) must exist
    var log = await getLog();
    var mergeCommit = log.find(function (c) {
      return c.parents.length === 2;
    });
    expect(mergeCommit).toBeDefined();
  });

  test('mergeCanvas deduplicates blocks that exist in both branches', async function () {
    var sharedBlock = {
      id: 'shared',
      type: 'basic.info',
      data: {},
      position: {},
    };
    var log0 = await getLog();
    var baseHash = log0[log0.length - 1].hash;

    // Advance main — has the shared block
    fs.writeFileSync(
      filepath,
      JSON.stringify({
        design: { graph: { blocks: [sharedBlock], wires: [] } },
        dependencies: {},
      })
    );
    W.iceGitManager.scheduleCommit('Main has shared');
    var r1 = waitForRefresh();
    W.iceGitManager.flushCommit();
    await r1;

    // Create explore from base — also has the same shared block (same id)
    var rB1 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.createBranch(baseHash, 'explore-dedup', r);
    });
    await rB1;

    var rB2 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.switchBranch('explore-dedup', r);
    });
    await rB2;

    fs.writeFileSync(
      filepath,
      JSON.stringify({
        design: {
          graph: {
            blocks: [
              sharedBlock,
              { id: 'extra', type: 'basic.input', data: {}, position: {} },
            ],
            wires: [],
          },
        },
        dependencies: {},
      })
    );
    W.iceGitManager.scheduleCommit('Explore has shared + extra');
    var r2 = waitForRefresh();
    W.iceGitManager.flushCommit();
    await r2;

    var r3 = waitForRefresh();
    await new Promise(function (resolve) {
      W.iceGitManager.mergeCanvas('explore-dedup', resolve);
    });
    await r3;

    var merged = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    var ids = merged.design.graph.blocks.map(function (b) {
      return b.id;
    });
    // 'shared' appears exactly once, 'extra' appears
    var sharedCount = ids.filter(function (id) {
      return id === 'shared';
    }).length;
    expect(sharedCount).toBe(1);
    expect(ids).toContain('extra');
  });

  test('onBranchSave fires when saving on a non-main branch', async function () {
    // Hook a spy onto iceTimeline.onBranchSave
    var capturedBranch = null;
    var origOnBranchSave = W.iceTimeline.onBranchSave;
    W.iceTimeline.onBranchSave = function (branchName) {
      capturedBranch = branchName;
    };

    // Create and switch to a feature branch
    var r1 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.createBranch('', 'side', r);
    });
    await r1;

    var r2 = waitForRefresh();
    await new Promise(function (r) {
      W.iceGitManager.switchBranch('side', r);
    });
    await r2;

    // Save on the feature branch
    fs.writeFileSync(filepath, JSON.stringify({ version: 99 }));
    W.iceGitManager.scheduleCommit('Side work');
    W.iceGitManager.flushCommit();

    // Wait briefly for the async commit + symbolic-ref chain
    await new Promise(function (r) {
      setTimeout(r, 800);
    });

    expect(capturedBranch).toBe('side');

    // Restore
    W.iceTimeline.onBranchSave = origOnBranchSave;
  });
});

// ── Hidden branches ───────────────────────────────────────────────────────────

describe('hidden branches', function () {
  var filepath, dir;

  beforeEach(async function () {
    var tmp = makeTempFile('hidden-test');
    filepath = tmp.filepath;
    dir = tmp.dir;
    var ready = waitForRefresh();
    W.iceGitManager.setDir(filepath);
    await ready;
  });

  afterEach(function () {
    W.iceGitManager.setDir('');
    rmrf(dir);
  });

  test('hideBranch adds a branch to the hidden list', async function () {
    await new Promise(function (r) {
      W.iceGitManager.hideBranch('feature-x', r);
    });
    var hidden = await getHidden();
    expect(hidden).toContain('feature-x');
  });

  test('unhideBranch removes a branch from the hidden list', async function () {
    await new Promise(function (r) {
      W.iceGitManager.hideBranch('feature-y', r);
    });
    await new Promise(function (r) {
      W.iceGitManager.unhideBranch('feature-y', r);
    });
    var hidden = await getHidden();
    expect(hidden).not.toContain('feature-y');
  });

  test('hiding the same branch twice does not duplicate it', async function () {
    await new Promise(function (r) {
      W.iceGitManager.hideBranch('dup', r);
    });
    await new Promise(function (r) {
      W.iceGitManager.hideBranch('dup', r);
    });
    var hidden = await getHidden();
    var count = hidden.filter(function (b) {
      return b === 'dup';
    }).length;
    expect(count).toBe(1);
  });

  test('unhiding a branch that was never hidden leaves the list unchanged', async function () {
    await new Promise(function (r) {
      W.iceGitManager.hideBranch('a', r);
    });
    await new Promise(function (r) {
      W.iceGitManager.unhideBranch('not-hidden', r);
    });
    var hidden = await getHidden();
    expect(hidden).toContain('a');
    expect(hidden).not.toContain('not-hidden');
  });
});
