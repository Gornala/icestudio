/**
 * sanpshot.js - Take PNG snapshots and video recordings of the canvas
 * Functions: takeSnapshotPNG, takeSnapshotVideo
 */
'use strict';

window._icetools = window._icetools || {};

window._icetools.snapshots = function (ctx) {
  function generateSnapshotName(extension) {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    var hours = String(now.getHours()).padStart(2, '0');
    var minutes = String(now.getMinutes()).padStart(2, '0');
    var seconds = String(now.getSeconds()).padStart(2, '0');
    return (
      'icestudio_' +
      year +
      '-' +
      month +
      '-' +
      day +
      '_' +
      hours +
      '.' +
      minutes +
      '.' +
      seconds +
      '.' +
      extension
    );
  }

  function takeSnapshotPNG() {
    var win = ctx.gui.Window.get();
    setTimeout(function () {
      win.capturePage(
        function (base64Data) {
          try {
            var imageBuffer = Buffer.from(base64Data, 'base64');
            var fileName = generateSnapshotName('png');
            var userHome = process.env.HOME || process.env.USERPROFILE;
            var savePath = ctx.nodePath.join(userHome, 'Desktop', fileName);
            ctx.nodeFs.writeFileSync(savePath, imageBuffer);
            alertify.success(
              ctx.gettextCatalog.getString('Snapshot saved: {{name}}', {
                name: savePath,
              }),
              30
            );
          } catch (err) {
            console.error('Error taking snapshot', err);
          }
        },
        { format: 'png', datatype: 'raw' }
      );
    }, 500);
  }

  var isRecording = false;
  var mediaRecorder = false;
  var stream = false;

  var takeSnapshotVideo = async function () {
    var wrapper = document.getElementById('main-icestudio-wrapper');
    if (!isRecording) {
      isRecording = true;
      try {
        var videoChunks = [];
        var displayMediaOptions = {
          video: { cursor: 'always' },
          audio: false,
        };
        stream =
          await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
        mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
        });
        mediaRecorder.ondataavailable = function (event) {
          if (event.data.size > 0) {
            videoChunks.push(event.data);
          }
        };
        mediaRecorder.onstop = async function () {
          var blob = new Blob(videoChunks, { type: 'video/webm' });
          var arrayBuffer = await blob.arrayBuffer();
          var fileName = generateSnapshotName('webm');
          var userHome = process.env.HOME || process.env.USERPROFILE;
          var savePath = ctx.nodePath.join(userHome, 'Desktop', fileName);
          ctx.nodeFs.writeFileSync(savePath, Buffer.from(arrayBuffer));
          alertify.success(
            ctx.gettextCatalog.getString('Video saved: {{name}}', {
              name: savePath,
            }),
            30
          );
        };
        setTimeout(function () {
          mediaRecorder.start();
        }, 750);
        wrapper.classList.add('icestudio-taking-snapshot-video');
      } catch (error) {
        console.error('MediaRecorder::ERROR', error);
        isRecording = false;
        alertify.error(
          ctx.gettextCatalog.getString(
            'Screen recording error. Review your permissions.'
          ),
          10
        );
      }
    } else {
      mediaRecorder.stop();
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
      wrapper.classList.remove('icestudio-taking-snapshot-video');
      isRecording = false;
    }
  };

  return {
    takeSnapshotPNG: takeSnapshotPNG,
    takeSnapshotVideo: takeSnapshotVideo,
  };
};
