import gulp from 'gulp'
import gulpif from 'gulp-if'
import livereload from 'gulp-livereload'
import args from './lib/args'
var exec = require('child_process').exec
var git = require('gulp-git')
const directoryExists = require('directory-exists')

gulp.task('get-list', () => {
  if (directoryExists.sync('./license-list')) {
    process.chdir('license-list')
    git.pull('origin', 'master', function (err) {
      if (err) throw err
    })
    process.chdir('..')
  } else {
    git.clone('https://github.com/spdx/license-list-data', { args: './license-list' }, function (err) {
      if (err) throw err
    })
  }
})

gulp.task('license-list', ['get-list'], () => {
  process.chdir('license-list/text')
  exec('ls *.txt > ../spdx.txt', function (err, stdout, stderr) {
    console.log(stdout)
    console.log(stderr)
  })
  process.chdir('../../')
  return gulp.src(['license-list/spdx.txt', 'license-list/text/*.txt'])
    .pipe(gulp.dest(`dist/${args.vendor}/license-list`))
    .pipe(gulpif(args.watch, livereload()))
})
