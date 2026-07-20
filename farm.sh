#!/bin/bash
git init
git checkout -b main
git add .
git commit -m "Initial commit"

for i in {1..40}; do
  branch="feature/update-$i"
  git checkout -b $branch
  echo "Commit $i" >> activity.txt
  git add activity.txt
  # create date up to 40 days in the past
  d=$(date -d "-$i days" +"%Y-%m-%dT12:00:00")
  export GIT_AUTHOR_DATE=$d
  export GIT_COMMITTER_DATE=$d
  git commit -m "Update feature $i"
  git checkout main
done

git remote add origin https://github.com/karansaini46/leadhunter.git
git push -u origin --all
