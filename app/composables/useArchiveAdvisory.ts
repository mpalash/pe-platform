/**
 * Whether the archive's content warning has been accepted.
 *
 * Shared state rather than a local ref because two things need the answer: the
 * modal that asks, and the archive behind it, which loads while the warning is
 * up but must not start PLAYING anything until it comes down.
 *
 * Not persisted, deliberately. Consent to see documented violence is given for
 * a visit, not banked against every future one — and re-reading a content
 * warning costs a click, which is the cheap side of that trade.
 */
export function useArchiveAdvisory() {
  /*
   * Per collection. The archive and the experience logs have their own
   * warnings, worded for what each covers, and accepting one is not having
   * read the other. The archive keeps the key it always had.
   */
  const spec = useArchiveCollection()
  const accepted = useState(`${spec.id}:advisoryAccepted`, () => false)

  return {
    accepted,
    accept: () => { accepted.value = true },
  }
}
