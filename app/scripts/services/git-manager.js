'use strict';

/* global nw */

window.iceGitManager = (function () {
  var nodePath = require('path');
  var nodeFs = require('fs');
  var childProcess = require('child_process');

  var _filepath = ''; // full path to .ice file
  var _dir = ''; // dirname of _filepath (work tree)
  var _filename = ''; // basename of _filepath (e.g. "A.ice")
  var _gitDir = ''; // per-file git metadata dir
  var _timer = null;
  var _pendingMsg = 'Save';
  var DEBOUNCE = 1500;

  // ── Split a shell-style argument string into an array (no shell needed) ────
  function _splitArgs(str) {
    var args = [];
    var cur = '';
    var inQ = false;
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (inQ) {
        if (c === '"') {
          inQ = false;
        } else {
          cur += c;
        }
      } else if (c === '"') {
        inQ = true;
      } else if (c === ' ') {
        if (cur) {
          args.push(cur);
          cur = '';
        }
      } else {
        cur += c;
      }
    }
    if (cur) {
      args.push(cur);
    }
    return args;
  }

  // ── Low-level git exec — always uses per-file --git-dir / --work-tree ──────
  // args may be a string (split by _splitArgs) or an array (used as-is).
  // Passing filenames as array elements avoids quoting issues with spaces.
  function exec(args, cb) {
    var argList = ['--git-dir=' + _gitDir, '--work-tree=' + _dir].concat(
      Array.isArray(args) ? args : _splitArgs(args)
    );
    childProcess.execFile(
      'git',
      argList,
      { cwd: _dir, timeout: 20000 },
      function (err, stdout, stderr) {
        cb(err ? stderr || err.message : null, stdout ? stdout.trim() : '');
      }
    );
  }

  // ── Ensure per-file git repo exists, create if not ────────────────────────
  function ensureRepo(cb) {
    if (nodeFs.existsSync(nodePath.join(_gitDir, 'HEAD'))) {
      cb(null);
      return;
    }
    try {
      nodeFs.mkdirSync(_gitDir, { recursive: true });
    } catch (e) {
      if (cb) {
        cb(String(e));
      }
      return;
    }
    exec('init', function (err2) {
      if (err2) {
        if (cb) {
          cb(err2);
        }
        return;
      }
      exec('config user.email "icestudio@local"', function () {
        exec('config user.name "Icestudio"', function () {
          exec(['add', _filename], function () {
            exec('commit -m "Initial project"', function () {
              if (cb) {
                cb(null);
              }
            });
          });
        });
      });
    });
  }

  // ── Internal commit: stages the project file and commits if changed ────────
  function _doCommit(msg) {
    if (!_dir || !_gitDir) {
      return;
    }
    ensureRepo(function (err) {
      if (err) {
        return;
      }
      exec(['add', _filename], function () {
        exec('diff --cached --quiet', function (changed) {
          if (!changed) {
            return; // null = exit 0 = nothing staged
          }
          exec('commit -m "' + msg.replace(/"/g, "'") + '"', function () {
            // If HEAD is detached (time-travelled), auto-create a branch so
            // these commits survive when the user switches back to master.
            exec('symbolic-ref HEAD', function (symErr) {
              if (symErr) {
                var d = new Date();
                var stamp =
                  d.getFullYear() +
                  ('0' + (d.getMonth() + 1)).slice(-2) +
                  ('0' + d.getDate()).slice(-2) +
                  '-' +
                  ('0' + d.getHours()).slice(-2) +
                  ('0' + d.getMinutes()).slice(-2) +
                  ('0' + d.getSeconds()).slice(-2);
                exec(['checkout', '-b', 'explore-' + stamp], function () {
                  if (window.iceTimeline) {
                    window.iceTimeline.refresh();
                  }
                });
              } else {
                if (window.iceTimeline) {
                  window.iceTimeline.refresh();
                }
              }
            });
          });
        });
      });
    });
  }

  // ── Flush any pending debounced commit immediately ────────────────────────
  function flushCommit() {
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
      _doCommit(_pendingMsg);
    }
  }

  // ── Schedule a debounced commit ───────────────────────────────────────────
  function scheduleCommit(msg) {
    if (!_dir) {
      return;
    }
    _pendingMsg = msg || 'Save';
    if (_timer) {
      clearTimeout(_timer);
    }
    _timer = setTimeout(function () {
      _timer = null;
      _doCommit(_pendingMsg);
    }, DEBOUNCE);
  }

  // ── Set active project file (full filepath) ───────────────────────────────
  // Pass '' or null to clear state when a new unsaved project is created.
  // Each .ice file gets its own git repo in .ice_history/<filename>/ next to it.
  function setDir(filepath) {
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    if (!filepath) {
      _filepath = '';
      _dir = '';
      _filename = '';
      _gitDir = '';
      if (window.iceTimeline) {
        window.iceTimeline.refresh();
      }
      return;
    }
    if (filepath === _filepath) {
      return;
    }
    _filepath = filepath;
    _dir = nodePath.dirname(filepath);
    _filename = nodePath.basename(filepath);
    _gitDir = nodePath.join(_dir, '.ice_history', _filename);
    ensureRepo(function () {
      if (window.iceTimeline) {
        window.iceTimeline.refresh();
      }
    });
  }

  // ── Commit log (all branches) ─────────────────────────────────────────────
  function getLog(cb) {
    if (!_gitDir) {
      cb(null, []);
      return;
    }
    var fmt = '--pretty=format:%H|%h|%P|%s|%D|%ci';
    exec('log --all ' + fmt, function (err, out) {
      if (err || !out) {
        cb(null, []);
        return;
      }
      var labelsFile = nodePath.join(_gitDir, 'ice_labels.json');
      var labels = {};
      try {
        labels = JSON.parse(nodeFs.readFileSync(labelsFile, 'utf8'));
      } catch (e) {}
      var commits = out
        .split('\n')
        .filter(Boolean)
        .map(function (line) {
          var p = line.split('|');
          var hash = p[0] || '';
          return {
            hash: hash,
            shortHash: p[1] || '',
            parents: p[2] ? p[2].split(' ').filter(Boolean) : [],
            subject: labels[hash] || p[3] || '',
            refs: p[4] || '',
            date: p[5] || '',
          };
        });
      cb(null, commits);
    });
  }

  // ── Hidden branches (stored in <gitDir>/ice_hidden.json) ─────────────────
  function getHiddenBranches(cb) {
    if (!_gitDir) {
      cb(null, []);
      return;
    }
    var f = nodePath.join(_gitDir, 'ice_hidden.json');
    try {
      cb(null, JSON.parse(nodeFs.readFileSync(f, 'utf8')));
    } catch (e) {
      cb(null, []);
    }
  }

  function setHiddenBranches(list, cb) {
    if (!_gitDir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    try {
      nodeFs.writeFileSync(
        nodePath.join(_gitDir, 'ice_hidden.json'),
        JSON.stringify(list)
      );
      if (cb) {
        cb(null);
      }
    } catch (e) {
      if (cb) {
        cb(String(e));
      }
    }
  }

  function hideBranch(name, cb) {
    getHiddenBranches(function (err, list) {
      if (list.indexOf(name) === -1) {
        list.push(name);
      }
      setHiddenBranches(list, cb);
    });
  }

  function unhideBranch(name, cb) {
    getHiddenBranches(function (err, list) {
      setHiddenBranches(
        list.filter(function (b) {
          return b !== name;
        }),
        cb
      );
    });
  }

  // ── Current HEAD hash ─────────────────────────────────────────────────────
  function getHead(cb) {
    if (!_gitDir) {
      cb('');
      return;
    }
    exec('rev-parse HEAD', function (err, out) {
      cb(err ? '' : out);
    });
  }

  // ── Time-travel: checkout a commit ────────────────────────────────────────
  function checkout(hash, cb) {
    if (!_gitDir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    flushCommit();
    exec('checkout ' + hash, function (err) {
      if (cb) {
        cb(err);
      }
      if (!err && window.iceTimeline) {
        window.iceTimeline.refresh();
      }
    });
  }

  // ── Create a branch at a commit (no HEAD switch) ──────────────────────────
  function createBranch(hash, name, cb) {
    if (!_gitDir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    var args = hash ? ['branch', name, hash] : ['branch', name];
    exec(args, function (err) {
      if (cb) {
        cb(err);
      }
      if (!err && window.iceTimeline) {
        window.iceTimeline.refresh();
      }
    });
  }

  // ── Switch to an existing branch ─────────────────────────────────────────
  function switchBranch(name, cb) {
    if (!_gitDir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    flushCommit();
    exec('checkout ' + name, function (err) {
      if (cb) {
        cb(err);
      }
      if (!err && window.iceTimeline) {
        window.iceTimeline.refresh();
      }
    });
  }

  // ── Delete a branch ──────────────────────────────────────────────────────
  function deleteBranch(name, cb) {
    if (!_gitDir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    exec('branch -d ' + name, function (err) {
      if (!err) {
        if (cb) {
          cb(null);
        }
        if (window.iceTimeline) {
          window.iceTimeline.refresh();
        }
        return;
      }
      exec('branch -D ' + name, function (err2) {
        if (cb) {
          cb(err2);
        }
        if (window.iceTimeline) {
          window.iceTimeline.refresh();
        }
      });
    });
  }

  // ── List all local branches ───────────────────────────────────────────────
  function listBranches(cb) {
    if (!_gitDir) {
      cb(null, []);
      return;
    }
    exec('branch --format=%(refname:short)', function (err, out) {
      cb(null, err || !out ? [] : out.split('\n').filter(Boolean));
    });
  }

  // ── Create a version tag ─────────────────────────────────────────────────
  function createTag(hash, version, cb) {
    if (!_gitDir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    exec('tag ' + version + ' ' + hash, function (err) {
      if (cb) {
        cb(err);
      }
      if (!err && window.iceTimeline) {
        window.iceTimeline.refresh();
      }
    });
  }

  // ── Rename a commit
  // HEAD → git amend; older → label override in <gitDir>/ice_labels.json
  function renameCommit(hash, newMsg, cb) {
    if (!_gitDir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    getHead(function (headHash) {
      if (headHash && headHash === hash) {
        exec(
          'commit --amend -m "' + newMsg.replace(/"/g, "'") + '"',
          function (err) {
            if (cb) {
              cb(err);
            }
            if (!err && window.iceTimeline) {
              window.iceTimeline.refresh();
            }
          }
        );
        return;
      }
      var labelsFile = nodePath.join(_gitDir, 'ice_labels.json');
      var labels = {};
      try {
        labels = JSON.parse(nodeFs.readFileSync(labelsFile, 'utf8'));
      } catch (e) {}
      labels[hash] = newMsg;
      try {
        nodeFs.writeFileSync(labelsFile, JSON.stringify(labels, null, 2));
        if (cb) {
          cb(null);
        }
        if (window.iceTimeline) {
          window.iceTimeline.refresh();
        }
      } catch (e) {
        if (cb) {
          cb(String(e));
        }
      }
    });
  }

  // ── Squash a commit into its parent (retire) ─────────────────────────────
  function squashIntoParent(hash, cb) {
    if (!_gitDir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    getHead(function (headHash) {
      if (headHash && headHash === hash) {
        exec('log -1 --pretty=%s HEAD~1', function (msgErr, parentMsg) {
          exec('reset --soft HEAD~1', function (err) {
            if (err) {
              if (cb) {
                cb(err);
              }
              return;
            }
            exec(
              'commit --amend -m "' +
                (parentMsg || 'Squashed').replace(/"/g, "'") +
                '"',
              function (err2) {
                if (cb) {
                  cb(err2);
                }
                if (window.iceTimeline) {
                  window.iceTimeline.refresh();
                }
              }
            );
          });
        });
        return;
      }
      var dataDir = nw.App.dataPath;
      var seqPath = nodePath.join(dataDir, 'ice_git_seq.js');
      var sh = hash.substring(0, 7);
      var seqScript =
        'var fs=require("fs");var f=process.argv[2];' +
        'var c=fs.readFileSync(f,"utf8");' +
        'c=c.replace(/^pick ' +
        sh +
        '/m,"squash ' +
        sh +
        '");' +
        'fs.writeFileSync(f,c);';
      try {
        nodeFs.writeFileSync(seqPath, seqScript);
      } catch (e) {
        if (cb) {
          cb(String(e));
        }
        return;
      }
      var env = Object.assign({}, process.env, {
        GIT_DIR: _gitDir,
        GIT_WORK_TREE: _dir,
        GIT_SEQUENCE_EDITOR: 'node "' + seqPath + '"',
        GIT_EDITOR: 'true',
      });
      childProcess.exec(
        'git rebase -i ' + hash + '^',
        { cwd: _dir, env: env, timeout: 30000 },
        function (err, stdout, stderr) {
          if (cb) {
            cb(err ? stderr || err.message : null);
          }
          if (window.iceTimeline) {
            window.iceTimeline.refresh();
          }
        }
      );
    });
  }

  // ── Export branch as a detached new project folder ───────────────────────
  // Clones the per-file git repo (which tracks only the .ice file), then
  // removes the .git dir from the export so it is a plain project copy.
  function exportAsNewProject(branch, destDir, cb) {
    if (!_gitDir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    childProcess.execFile(
      'git',
      ['clone', '--branch', branch, '--single-branch', _gitDir, destDir],
      { timeout: 30000 },
      function (err, stdout, stderr) {
        if (err) {
          if (cb) {
            cb(stderr || err.message);
          }
          return;
        }
        var gitD = nodePath.join(destDir, '.git');
        var rmCmd =
          process.platform === 'win32'
            ? 'rmdir /s /q "' + gitD + '"'
            : 'rm -rf "' + gitD + '"';
        childProcess.exec(rmCmd, { timeout: 10000 }, function () {
          if (cb) {
            cb(null, destDir);
          }
        });
      }
    );
  }

  return {
    setDir: setDir,
    scheduleCommit: scheduleCommit,
    flushCommit: flushCommit,
    getLog: getLog,
    getHead: getHead,
    checkout: checkout,
    createBranch: createBranch,
    switchBranch: switchBranch,
    deleteBranch: deleteBranch,
    listBranches: listBranches,
    createTag: createTag,
    renameCommit: renameCommit,
    squashIntoParent: squashIntoParent,
    exportAsNewProject: exportAsNewProject,
    getHiddenBranches: getHiddenBranches,
    hideBranch: hideBranch,
    unhideBranch: unhideBranch,
    getDir: function () {
      return _dir;
    },
  };
})();
