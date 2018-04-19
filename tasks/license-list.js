import gulp from 'gulp'
import gulpif from 'gulp-if'
import livereload from 'gulp-livereload'
import args from './lib/args'
var fs = require('fs');
var exec = require('child_process').exec;
 
gulp.task('license-list', () => {
  process.chdir('license-list/text')
  exec('ls *.txt > ../spdx.txt', function (err, stdout, stderr) {
    console.log(stdout);
    console.log(stderr);
  });
  process.chdir('../..')
  return gulp.src(['license-list/spdx.txt','license-list/text/*.txt'])
    .pipe(gulp.dest(`dist/${args.vendor}/license-list`))
    .pipe(gulpif(args.watch, livereload()))
})


