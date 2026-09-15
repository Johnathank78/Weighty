/** Model-mismatch calibration benchmark, scenarios A,B,C at 84 days (IMPLEMENTATION_NOTES T-04). */
import { describeMismatchScenarios } from '../helpers/mismatchSuite';

describeMismatchScenarios(['A', 'B', 'C'], 84, 70_000);
