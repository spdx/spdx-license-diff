import gulp from 'gulp'
import gulpif from 'gulp-if'
import livereload from 'gulp-livereload'
import args from './lib/args'
var fs = require('fs');


gulp.task('license-list', () => {
  return gulp.src(['app/license-list/spdx.txt','app/license-list/text/*.txt'])
    .pipe(gulp.dest(`dist/${args.vendor}/license-list`))
    .pipe(gulpif(args.watch, livereload()))
})


