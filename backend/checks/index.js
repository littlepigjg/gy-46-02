import fileSizeCheck from './fileSizeCheck.js';
import dimensionsCheck from './dimensionsCheck.js';
import blankPageCheck from './blankPageCheck.js';
import errorKeywordsCheck from './errorKeywordsCheck.js';
import loadCompletenessCheck from './loadCompletenessCheck.js';

export {
  fileSizeCheck,
  dimensionsCheck,
  blankPageCheck,
  errorKeywordsCheck,
  loadCompletenessCheck
};

export const ALL_CHECKS = [
  fileSizeCheck,
  dimensionsCheck,
  blankPageCheck,
  errorKeywordsCheck,
  loadCompletenessCheck
];

export default ALL_CHECKS;
