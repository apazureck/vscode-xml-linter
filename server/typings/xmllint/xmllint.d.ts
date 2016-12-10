declare interface xmllint {
    
    /**
     * Validates the given xml using the given schemas
     * 
     * @export
     * @param {XmlArguments} args Arguments to evaluate.
     * @returns {{ error: string[] }}
     */
    validateXML(args: xmllint.XmlArguments): xmllint.Result;
}

declare namespace xmllint {
    /**
     * Arguments for the xmllint.validateXML function
     * 
     * @interface XmlArguments
     */
    interface XmlArguments {
        /**
         * The xml document to evaluate.
         * 
         * @type {string}
         * @memberOf XmlArguments
         */
        xml: string[]|string;
        /**
         * The schema(s) to evaluate the xml against.
         * 
         * @type {(string[]|string)}
         * @memberOf XmlArguments
         */
        schema: string[]|string;
    }

    interface Result {
        errors: string[]
    }
}