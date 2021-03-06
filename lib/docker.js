module.exports = {
    container: container,
    getImage: getImage,
    download: download,
    update: update,
    restart: restart,
    logs: logs,
    destroyLogStream: destroyLogStream,
    isLogStream: isLogStream
};

var Docker = require('dockerode');
var docker = new Docker({socketPath: '/var/run/docker.sock'});
var q = require('q');
var request = require('request');
var fs = require('fs');

const os = require('os');

var stream;
var streamTimeout;

function container(){
    if (docker) {
        return docker.getContainer("tin");
    }else{
        return null;
    }
}

function restart(url){

    var restartTinUrl = url + "/container/tin/command/restart";

    request.put(restartTinUrl, function (error, response, body) {

        if (error) {
            console.error('error:', error);
        }else{
            console.log('statusCode:', response && response.statusCode);
            console.log('body:', body);
        }

    }.bind(this));
}

function getImage(version){

    var deferred = q.defer();

    docker.listImages(function (error, images){

        if (error){
            deferred.reject(error);
        }

        var imageName = getImageTag(version);

        for (var i=0; i<images.length; i++) {
            if (images[i].RepoTags && images[i].RepoTags[0] == imageName) {
                console.info("Image " + imageName + " already available on host.");
                return deferred.resolve(images[i]);
            }
        }

        console.info("Image " + imageName + " is not available on host.");
        return deferred.resolve();

    }.bind(this));

    return deferred.promise;
}

function download(url, version){

    var deferred = q.defer();

    console.log(url + "/images/" + encodeURIComponent(getImageTag(version)));

    var put = request.put(url + "/images/" + encodeURIComponent(getImageTag(version)), function (error, response, body) {

    }.bind(this));

    put.on('data', function(data) {
        var json = data.toString('utf8');
        console.info(json);
    }.bind(this));

    put.on('error', function(error) {
        console.error(error);
    }.bind(this));

    put.on('end', function() {
        console.info("Download completed.");
        return deferred.resolve();
    }.bind(this));


    return deferred.promise;
}

function isLogStream(){
    if (this.stream){
        return true;
    }else{
        return false;
    }
}

function destroyLogStream(){

    console.log(">> destroyLogStream: " + (this.stream ? true : false));

    if (this.stream){

        this.stream.destroy();
        this.stream = null;

        console.log("Current log stream destroyed.");

        if (this.streamTimeout){
            clearTimeout(this.streamTimeout);
        }
    }
}

function logs(config, logStream){

    var deferred = q.defer();

    var container = this.container();

    container.logs(config, function(error, stream){

        console.info("Config:" + JSON.stringify(config))

        if(error) {
            console.error(error.message);
            return deferred.reject(error);
        }

        container.modem.demuxStream(stream, logStream, logStream);

        stream.on('end', function(){
            logStream.end('!stop!');
        });

        var timeout = 10000;
        if (config.follow){
            timeout = 300000;
            this.stream = stream;
        }

        this.streamTimeout = setTimeout(function() {
            this.destroyLogStream();
        }.bind(this), timeout);

        return deferred.resolve();

    }.bind(this));

    return deferred.promise;
}

function update(url, version, body){

    console.info("TIN Image " + encodeURIComponent(getImageTag(version)) + " available. Upgrading TIN container ...");

    var updateTinUrl = url + "/container/tin/" + encodeURIComponent(getImageTag(version));

    var put = request.put(updateTinUrl, body, function (error, response, body) {

        if (error) {
            console.error('error:', error);
        }else{
            console.log('statusCode:', response && response.statusCode);
            console.log('body:', body);
        }

    }.bind(this));

    var containerDefinition = process.cwd() + "/configurations/tin.json";

    console.info("Reading container definition from " + containerDefinition);

    fs.createReadStream(containerDefinition).pipe(put);
}

function getImageTag(version){

    if (os.arch() == "arm"){
        return "thingit/thing-it-node:" + version + "-armv7-boron";
    }else{
        return "thingit/thing-it-node:" + version + "-x86-jessie";
    }
}