import gulp from 'gulp'
import tagVersion from 'gulp-tag-version'
import git from 'gulp-git'

var exec = require('child_process').exec;

gulp.task('changelog', () => {
  exec('gren c --generate --override -B -t all', function (err, stdout, stderr) {
    console.log(stdout);
    console.log(stderr);
  });
  return gulp.src([
    'package.json',
  ], {
    base: './'
  })
    // commit the changelog
    .pipe(git.commit('add changelog'))
    
    // **tag it in the repository**
    .pipe(tagVersion())
})
