'use strict';

// ============================================================
// VCD (Value Change Dump) Parser
// Parses Icarus Verilog VCD output into a structured data model.
// ============================================================

window.parseVCD = function (vcdContent) {
  var result = {
    timescale: '1ps',
    timescaleValue: 1,
    timescaleUnit: 'ps',
    maxTime: 0,
    signals: [],
  };

  if (!vcdContent) {
    return result;
  }

  var lines = vcdContent.split('\n');
  var signalMap = {}; // VCD id -> signal object
  var scopeStack = [];
  var inHeader = true;
  var currentTime = 0;

  // -----------------------------------------------------------
  // Pass 1: Parse header (everything before $enddefinitions)
  // -----------------------------------------------------------
  var i = 0;
  while (i < lines.length) {
    var line = lines[i].trim();
    i++;

    if (
      line === '' ||
      (line.charAt(0) === '$' && line.indexOf('$comment') === 0)
    ) {
      continue;
    }

    // $timescale
    if (line.indexOf('$timescale') === 0) {
      // timescale might be on next line
      var tsLine = line.replace('$timescale', '').replace('$end', '').trim();
      if (!tsLine) {
        tsLine = (lines[i] || '').trim().replace('$end', '').trim();
        i++;
      }
      // skip to $end
      while (i < lines.length && lines[i].trim() !== '$end') {
        i++;
      }
      if (lines[i] && lines[i].trim() === '$end') {
        i++;
      }

      result.timescale = tsLine;
      var tsMatch = tsLine.match(/(\d+)\s*(s|ms|us|ns|ps|fs)/);
      if (tsMatch) {
        result.timescaleValue = parseInt(tsMatch[1], 10);
        result.timescaleUnit = tsMatch[2];
      }
      continue;
    }

    // $scope
    if (line.indexOf('$scope') === 0) {
      var scopeParts = line.split(/\s+/);
      // $scope module|task|function <name> $end
      if (scopeParts.length >= 3) {
        scopeStack.push(scopeParts[2]);
      }
      continue;
    }

    // $upscope
    if (line.indexOf('$upscope') === 0) {
      scopeStack.pop();
      continue;
    }

    // $var
    if (line.indexOf('$var') === 0) {
      // $var <type> <width> <id> <name> [<bit_range>] $end
      var varParts = line.split(/\s+/);
      // varParts: ['$var', 'wire', '8', '!', 'register_decoder', '[7:0]', '$end']
      if (varParts.length >= 5) {
        var sigType = varParts[1];
        var sigWidth = parseInt(varParts[2], 10);
        var sigId = varParts[3];
        var sigName = varParts[4];

        // Skip if this VCD id is already registered (alias in child scope)
        if (!signalMap[sigId]) {
          var fullName =
            (scopeStack.length > 0 ? scopeStack.join('.') + '.' : '') + sigName;

          var signal = {
            id: sigId,
            name: sigName,
            fullName: fullName,
            width: sigWidth,
            type: sigType,
            changes: [],
          };

          signalMap[sigId] = signal;
          result.signals.push(signal);
        }
      }
      continue;
    }

    // $enddefinitions
    if (line.indexOf('$enddefinitions') === 0) {
      inHeader = false;
      break;
    }
  }

  // -----------------------------------------------------------
  // Pass 2: Parse value changes (after $enddefinitions)
  // -----------------------------------------------------------
  var inDumpvars = false;

  while (i < lines.length) {
    var line2 = lines[i].trim();
    i++;

    if (line2 === '' || line2 === '$end') {
      if (inDumpvars) {
        inDumpvars = false;
      }
      continue;
    }

    // Skip keywords
    if (line2 === '$dumpall' || line2 === '$dumpoff' || line2 === '$dumpon') {
      continue;
    }
    if (line2.indexOf('$comment') === 0) {
      // skip to $end
      while (i < lines.length && lines[i].trim() !== '$end') {
        i++;
      }
      i++;
      continue;
    }
    if (line2 === '$dumpvars') {
      inDumpvars = true;
      continue;
    }

    // Timestamp: #<number>
    if (line2.charAt(0) === '#') {
      currentTime = parseInt(line2.substring(1), 10);
      if (currentTime > result.maxTime) {
        result.maxTime = currentTime;
      }
      continue;
    }

    // Vector value: b<binary> <id>  or  B<binary> <id>
    if (line2.charAt(0) === 'b' || line2.charAt(0) === 'B') {
      var spaceIdx = line2.indexOf(' ');
      if (spaceIdx > 0) {
        var binVal = line2.substring(1, spaceIdx);
        var vecId = line2.substring(spaceIdx + 1).trim();
        var vecSig = signalMap[vecId];
        if (vecSig) {
          // Pad to signal width
          var padded = padBinary(binVal, vecSig.width);
          vecSig.changes.push({ time: currentTime, value: padded });
        }
      }
      continue;
    }

    // Real value: r<float> <id> or R<float> <id>
    if (line2.charAt(0) === 'r' || line2.charAt(0) === 'R') {
      var rSpaceIdx = line2.indexOf(' ');
      if (rSpaceIdx > 0) {
        var realVal = line2.substring(1, rSpaceIdx);
        var realId = line2.substring(rSpaceIdx + 1).trim();
        var realSig = signalMap[realId];
        if (realSig) {
          realSig.changes.push({ time: currentTime, value: realVal });
        }
      }
      continue;
    }

    // Scalar value: <value><id>  where value is 0,1,x,X,z,Z
    var firstChar = line2.charAt(0);
    if (
      firstChar === '0' ||
      firstChar === '1' ||
      firstChar === 'x' ||
      firstChar === 'X' ||
      firstChar === 'z' ||
      firstChar === 'Z'
    ) {
      var scalarId = line2.substring(1).trim();
      var scalarSig = signalMap[scalarId];
      if (scalarSig) {
        scalarSig.changes.push({
          time: currentTime,
          value: firstChar.toLowerCase(),
        });
      }
      continue;
    }
  }

  return result;
};

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

function padBinary(binStr, width) {
  if (binStr.length >= width) {
    return binStr.substring(binStr.length - width);
  }
  // Pad left: if first char is x or z, pad with that; otherwise pad with 0
  var padChar = '0';
  var first = binStr.charAt(0);
  if (first === 'x' || first === 'X') {
    padChar = 'x';
  } else if (first === 'z' || first === 'Z') {
    padChar = 'z';
  }
  var padding = '';
  for (var j = 0; j < width - binStr.length; j++) {
    padding += padChar;
  }
  return padding + binStr;
}
