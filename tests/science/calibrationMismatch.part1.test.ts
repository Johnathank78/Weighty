/** Model-mismatch calibration benchmark, scenarios A,B,C at 42 days (IMPLEMENTATION_NOTES T-04). */
import { describeMismatchScenarios } from '../helpers/mismatchSuite';

describeMismatchScenarios(['A', 'B', 'C'], 42, 50_000);
