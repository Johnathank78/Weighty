/** Model-mismatch calibration benchmark, scenarios D,E,F at 84 days (IMPLEMENTATION_NOTES T-04). */
import { describeMismatchScenarios } from '../helpers/mismatchSuite';

describeMismatchScenarios(['D', 'E', 'F'], 84, 80_000);
