/*global nodeca, _*/


"use strict";


// stdlib
var crypto  = require('crypto');
var path    = require('path');
var exec    = require('child_process').exec;


// 3rd-party
var neuron = require('neuron');


// directory where to put results
var RESULTS_DIR = path.resolve(__dirname, '../../public');


// internal cache used by get_font()
var font_configs;


// return font configuration
function get_font(name) {
  if (!font_configs) {
    font_configs = {};
    nodeca.shared.fontomas.embedded_fonts.forEach(function (config) {
      font_configs[config.font.fontname] = config;
    });
  }

  return font_configs[name];
}


// return valid glyphs configuration
function get_glyphs_config(params) {
  var glyphs = [];

  if (!_.isObject(params) || !_.isArray(params.glyphs)) {
    return null;
  }

  _.each(params.glyphs, function (g) {
    var font = get_font(g.src), glyph;

    if (!font) {
      // unknown glyph source font
      return;
    }

    glyph = _.find(font.glyphs, function (config) {
      return config.code === g.from;
    });

    if (!glyph) {
      // unknown glyph code
      return;
    }

    glyphs.push({
      css:  glyph.css,
      src:  g.src,
      from: g.from,
      code: g.code || g.from
    });
  });

  if (0 === glyphs.length) {
    // at least one glyph is required
    return null;
  }

  // return glyphs config sorted by original codes
  return _.sortBy(glyphs, function (g) { return g.from; });
}


// returns unique ID for requested list of glyphs
function get_download_id(glyphs) {
  return crypto.createHash('sha1').update(JSON.stringify(glyphs)).digest('hex');
}


function get_download_path(font_id) {
  var a, b;

  a = font_id.substr(0, 2);
  b = font_id.substr(2, 2);

  return "download/" + [a, b, font_id].join("/") + ".zip";
}


function get_download_url(font_id) {
  return "http://www.fontello.com/" + get_download_path(font_id);
}


// status of jobs by their ids
var jobs = {};


// returns instance of job (searches on FS if needed)
function get_job(font_id, callback) {
  var job = jobs[font_id], file;

  if (job) {
    callback(job);
    return;
  }

  file = path.join(RESULTS_DIR, get_download_path(font_id));
  path.exists(file, function (result) {
    if (!result) {
      callback(/* undefined */);
      return;
    }

    callback({status: 'ready', url: get_download_url(font_id)});
  });
}


// define queue and jobs
var job_mgr = new (neuron.JobManager)();
job_mgr.addJob('generate-font', {
  dirname: '/tmp',
  concurrency: 4,
  work: function (config) {
    var self = this;
    exec('date', function (err, stdout, stderr) {
      // TODO: job logic here
      self.finished = true;
    });
  }
});



// request font generation status
module.exports.status = function (params, callback) {
  get_job(params.id, function (job) {
    var response;

    if (!job) {
      callback("Unknown job id.");
      return;
    }

    response = {status: job.status};

    if ('enqueued' === job.status) {
      response.position = job_mgr.getPosition('generate-font', job.worker_id);
    }

    if ('ready' === job.status) {
      response.url = job.url;
    }

    callback(job.error, response);
  });
};


// request font generation
module.exports.generate = function (params, callback) {
  var glyphs = get_glyphs_config(params),
      font_id, font_url, response;

  if (!glyphs) {
    callback("Invalid request");
    return;
  }

  font_id  = get_download_id(glyphs);
  font_url = get_download_url(font_id);

  // enqueue new unique job
  if (!jobs[font_id]) {
    jobs[font_id] = {
      status:     'enqueued',
      worker_id:  job_mgr.enqueue('generate-font', font_id, glyphs)
    };
  }

  module.exports.status({id:  font_id}, callback);
};