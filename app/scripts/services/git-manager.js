'use strict';

/* global nw */

window.iceGitManager = (function () {
  var nodePath = require('path');
  var nodeFs = require('fs');
  var childProcess = require('child_process');

  var _dir = '';
  var _timer = null;
  var _pendingMsg = 'Save';
  var DEBOUNCE = 1500;

  // ── Split a shell-style argument string into an array (no shell needed) ────
  // Handles double-quoted tokens; strips quotes. Keeps | % & etc. literal.
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

  // ── Low-level git exec (shell-free via execFile to avoid cmd.exe issues) ───
  function exec(args, dir, cb) {
    var argList = _splitArgs(args);
    childProcess.execFile(
      'git',
      argList,
      { cwd: dir, timeout: 20000 },
      function (err, stdout, stderr) {
        cb(err ? stderr || err.message : null, stdout ? stdout.trim() : '');
      }
    );
  }

  // ── Ensure git repo exists, create if not ────────────────────────────────
  // Check dir itself (not parent dirs) so projects saved inside the icestudio
  // source tree don't accidentally commit into the icestudio repo.
  function ensureRepo(dir, cb) {
    if (nodeFs.existsSync(nodePath.join(dir, '.git'))) {
      cb(null);
      return;
    }
    exec('init', dir, function (err2) {
      if (err2) {
        if (cb) {
          cb(err2);
        }
        return;
      }
      var gi = nodePath.join(dir, '.gitignore');
      if (!nodeFs.existsSync(gi)) {
        try {
          nodeFs.writeFileSync(gi, '*.v\n*.pcf\nbuild/\n');
        } catch (e) {}
      }
      exec('config user.email "icestudio@local"', dir, function () {
        exec('config user.name "Icestudio"', dir, function () {
          exec('add -A', dir, function () {
            exec('commit -m "Initial project"', dir, function () {
              if (cb) {
                cb(null);
              }
            });
          });
        });
      });
    });
  }

  // ── Internal commit: stages all and commits if anything changed ───────────
  function _doCommit(dir, msg) {
    if (!dir) {
      return;
    }
    ensureRepo(dir, function (err) {
      if (err) {
        return;
      }
      exec('add -A', dir, function () {
        // diff --cached --quiet: exits 1 (err) if staged changes exist
        exec('diff --cached --quiet', dir, function (changed) {
          if (!changed) {
            return; // null = exit 0 = nothing staged
          }
          exec('commit -m "' + msg.replace(/"/g, "'") + '"', dir, function () {
            if (window.iceTimeline) {
              window.iceTimeline.refresh();
            }
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
      _doCommit(_dir, _pendingMsg);
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
      _doCommit(_dir, _pendingMsg);
    }, DEBOUNCE);
  }

  // ── Set / switch active project directory ─────────────────────────────────
  function setDir(dir) {
    if (!dir || dir === _dir) {
      return;
    }
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    _dir = dir;
    ensureRepo(dir, function () {
      if (window.iceTimeline) {
        window.iceTimeline.refresh();
      }
    });
  }

  // ── Commit log (all branches) ─────────────────────────────────────────────
  function getLog(cb) {
    if (!_dir) {
      cb(null, []);
      return;
    }
    var fmt = '--pretty=format:%H|%h|%P|%s|%D|%ci';
    exec('log --all ' + fmt, _dir, function (err, out) {
      if (err || !out) {
        cb(null, []);
        return;
      }
      var labelsFile = nodePath.join(_dir, '.git', 'ice_labels.json');
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

  // ── Current HEAD hash ─────────────────────────────────────────────────────
  function getHead(cb) {
    if (!_dir) {
      cb('');
      return;
    }
    exec('rev-parse HEAD', _dir, function (err, out) {
      cb(err ? '' : out);
    });
  }

  // ── Time-travel: checkout a commit ────────────────────────────────────────
  function checkout(hash, cb) {
    if (!_dir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    flushCommit();
    exec('checkout ' + hash, _dir, function (err) {
      if (cb) {
        cb(err);
      }
      if (!err && window.iceTimeline) {
        window.iceTimeline.refresh();
      }
    });
  }

  // ── Create a branch at a commit ───────────────────────────────────────────
  function createBranch(hash, name, cb) {
    if (!_dir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    var args = hash
      ? 'checkout -b ' + name + ' ' + hash
      : 'checkout -b ' + name;
    exec(args, _dir, function (err) {
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
    if (!_dir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    flushCommit();
    exec('checkout ' + name, _dir, function (err) {
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
    if (!_dir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    exec('branch -d ' + name, _dir, function (err) {
      if (!err) {
        if (cb) {
          cb(null);
        }
        if (window.iceTimeline) {
          window.iceTimeline.refresh();
        }
        return;
      }
      exec('branch -D ' + name, _dir, function (err2) {
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
    if (!_dir) {
      cb(null, []);
      return;
    }
    exec('branch --format=%(refname:short)', _dir, function (err, out) {
      cb(null, err || !out ? [] : out.split('\n').filter(Boolean));
    });
  }

  // ── Create a version tag ─────────────────────────────────────────────────
  function createTag(hash, version, cb) {
    if (!_dir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    exec('tag ' + version + ' ' + hash, _dir, function (err) {
      if (cb) {
        cb(err);
      }
      if (!err && window.iceTimeline) {
        window.iceTimeline.refresh();
      }
    });
  }

  // ── Rename a commit
  // HEAD → git amend; older → label override in .git/ice_labels.json
  function renameCommit(hash, newMsg, cb) {
    if (!_dir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    getHead(function (headHash) {
      if (headHash && headHash === hash) {
        exec(
          'commit --amend -m "' + newMsg.replace(/"/g, "'") + '"',
          _dir,
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
      var labelsFile = nodePath.join(_dir, '.git', 'ice_labels.json');
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
    if (!_dir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    getHead(function (headHash) {
      if (headHash && headHash === hash) {
        exec('log -1 --pretty=%s HEAD~1', _dir, function (msgErr, parentMsg) {
          exec('reset --soft HEAD~1', _dir, function (err) {
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
              _dir,
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
      // Non-HEAD: use rebase with a node-script sequence editor
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
  function exportAsNewProject(branch, destDir, cb) {
    if (!_dir) {
      if (cb) {
        cb('No project dir');
      }
      return;
    }
    childProcess.exec(
      'git clone --branch ' +
        branch +
        ' --single-branch "' +
        _dir +
        '" "' +
        destDir +
        '"',
      { timeout: 30000 },
      function (err, stdout, stderr) {
        if (err) {
          if (cb) {
            cb(stderr || err.message);
          }
          return;
        }
        var gitDir = nodePath.join(destDir, '.git');
        var rmCmd =
          process.platform === 'win32'
            ? 'rmdir /s /q "' + gitDir + '"'
            : 'rm -rf "' + gitDir + '"';
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
    getDir: function () {
      return _dir;
    },
  };
})();
