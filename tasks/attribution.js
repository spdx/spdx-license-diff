import gulp from 'gulp'
import gulpif from 'gulp-if'
import livereload from 'gulp-livereload'
import args from './lib/args'
var exec = require('child_process').exec

gulp.task('ossattribution', () => {
  exec('generate-attribution --production', function (err, stdout, stderr) {
    console.log(stdout)
    console.log(stderr)
  })
  return gulp.src('oss-attribution/attribution.txt')
    .pipe(gulp.dest(`dist/${args.vendor}/`))
    .pipe(gulpif(args.watch, livereload()))
})
