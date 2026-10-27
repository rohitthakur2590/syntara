import { Alert, Button, HelperText, HelperTextItem } from '@patternfly/react-core'

const ELIGIBILITY_HELP_TEXT_NO_SEARCH =
  'This picker shows enabled, published workflows in this project that have a Sub-workflow Trigger. To make one eligible, add a Sub-workflow Trigger to a child workflow in this project and publish it, then refresh workflows.'
const ELIGIBILITY_HELP_TEXT_WITH_SEARCH =
  'No workflows match your search. This picker shows enabled, published workflows in this project that have a Sub-workflow Trigger.'

export function WorkflowSelectorFeedback({
  workflowError,
  hasError,
  errorVariant,
  errorMessage,
  hasOptions,
  showEligibilityHelp,
  hasSearchTerm,
  onRetry,
}: Readonly<{
  workflowError?: string
  hasError: boolean
  errorVariant: 'danger' | 'warning'
  errorMessage: string
  hasOptions: boolean
  showEligibilityHelp: boolean
  hasSearchTerm: boolean
  onRetry: () => void
}>) {
  const eligibilityHelpText = hasSearchTerm ? ELIGIBILITY_HELP_TEXT_WITH_SEARCH : ELIGIBILITY_HELP_TEXT_NO_SEARCH
  return (
    <>
      {workflowError && (
        <HelperText>
          <HelperTextItem variant="error">{workflowError}</HelperTextItem>
        </HelperText>
      )}
      {hasError && (
        <Alert variant={errorVariant} isInline isPlain title={errorMessage}>
          {hasOptions
            ? 'Successfully verified workflows remain selectable. '
            : 'Retry to check for eligible workflows. '}
          <Button variant="link" type="button" onClick={onRetry}>
            Retry
          </Button>
        </Alert>
      )}
      {showEligibilityHelp && (
        <HelperText>
          <HelperTextItem>{eligibilityHelpText}</HelperTextItem>
        </HelperText>
      )}
      {showEligibilityHelp && !hasSearchTerm && (
        <Button variant="link" type="button" onClick={onRetry}>
          Refresh workflows
        </Button>
      )}
    </>
  )
}
