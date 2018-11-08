import gulp from 'gulp'
var exec = require('child_process').exec;

gulp.task('changelog',() => {
  exec('gren c --override', function (err, stdout, stderr) {
    console.log(stdout);
    console.log(stderr);
  });
})
