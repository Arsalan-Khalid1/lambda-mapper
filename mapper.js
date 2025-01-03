const { Xslt, XmlParser } = require("xslt-processor");
const { parseStringPromise } = require("xml2js");
const yaml = require("js-yaml");
const axios = require("axios");
const libxmljs = require("libxmljs")
const xml2js = require("xml2js")
const xml2json = require('xml2json')
const xsltProcessor = require("xslt-processor")
const fs = require("fs")
const { xmlParse, xsltProcess } = xsltProcessor

let logSteps = [];
const AIRTABLE_API_URL =
  "https://api.airtable.com/v0/appW7fUkTEqqte9Jc/tblKrfebiQ84S7gDr/";
const CLOUD_EVENT_API_URL =
  "https://api.airtable.com/v0/appW7fUkTEqqte9Jc/tblEbGgpBlm99SZwS/"
const AIRTABLE_API_KEY =
  "patBu6X4Dgrvl2s8H.62e775086221aa3cb46b47de6d03b3c7ee20fc4e116be7d513e9150eb23afe05";

const fetchAirtableData = async (url) => {
  const { baseId, recordId, tableId } = extractAirtableIds(url);
  console.log(`https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}/`);
  try {
    const response = await axios.get(
      `https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}/`,
      {
        headers: {
          Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        },
      }
    );
    const content = response.data.fields["Content"];
    console.log(`data : ${normalizeString(content)}`);
    // Process the records as needed
    return normalizeString(content);
  } catch (error) {
    console.error("Error fetching data from Airtable:", error.message);
    throw new error
  }
};

const uploadToAirtable = async (
  data,
  uri = AIRTABLE_API_URL,
  baseId,
  tableId
) => {
  // Extract baseId and tableId from AIRTABLE_API_URL if they are not passed in
  if (!baseId || !tableId) {
    const { baseId: extractedBaseId, tableId: extractedTableId } =
      extractBaseAndTableIdsFromApiUrl(uri)
    baseId = baseId || extractedBaseId
    tableId = tableId || extractedTableId
  }

  const url = uri ?? AIRTABLE_API_URL
  console.log({ url, baseId, tableId })

  let payload

  // Check if data is an object and stringify it before sending to Airtable
  data = parseJsonStrings(data)
  let contentValue =
    typeof data === "object" ? JSON.stringify(data, null, 2) : data
  contentValue = cleanJsonString(contentValue)

 if (uri && uri !== AIRTABLE_API_URL) {
   const fieldsExisting = await getAirtableFields(uri)
   if (fieldsExisting.length > 1) {
     payload = {
       records: [
         {
           fields: {
             [fieldsExisting[1]]: contentValue, // Now, content is a string
           },
         },
       ],
     }
   } else {
     payload = {
       records: [
         {
           fields: {
             [fieldsExisting[0]]: contentValue, // Now, content is a string
           },
         },
       ],
     }
   }
   console.log("payload with uri ", payload)
 } else {
   payload = {
     records: [
       {
         fields: {
           Content: contentValue, // Now, content is a string
         },
       },
     ],
   }
   console.log("payload without uri  ", payload)
 }

  // Now stringify the entire data object properly
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    })

    const outputUrl = `https://airtable.com/${baseId}/${tableId}/${response.data.records[0].id}`
    console.log(outputUrl)
    return uri === AIRTABLE_API_URL ? outputUrl : uri
  } catch (error) {
    console.error(
      "Error uploading data to Airtable:",
      error.response?.data || error.message
    )
    throw new Error(error)
  }
}

const uploadToCloudEvent = async (
  data,
  uri = CLOUD_EVENT_API_URL,
  baseId,
  tableId
) => {
  // Extract baseId and tableId from API URL if they are not passed in
  if (!baseId || !tableId) {
    const { baseId: extractedBaseId, tableId: extractedTableId } =
      extractBaseAndTableIdsFromApiUrl(uri)
    baseId = baseId || extractedBaseId
    tableId = tableId || extractedTableId
  }

  const url = uri ?? CLOUD_EVENT_API_URL
  console.log({ url, baseId, tableId })

  let payload

  // Check if data is an object and stringify it before sending to Airtable
  data = parseJsonStrings(data)
  let contentValue =
    typeof data === "object" ? JSON.stringify(data, null, 2) : data
  contentValue = cleanJsonString(contentValue)

  if (uri && uri !== CLOUD_EVENT_API_URL) {
    const fieldsExisting = await getAirtableFields(uri)
    if (fieldsExisting.length > 1) {
      payload = {
        records: [
          {
            fields: {
              [fieldsExisting[1]]: contentValue, // Now, content is a string
            },
          },
        ],
      }
    } else {
      payload = {
        records: [
          {
            fields: {
              [fieldsExisting[0]]: contentValue, // Now, content is a string
            },
          },
        ],
      }
    }
    console.log("payload with uri ", payload)
  } else {
    payload = {
      records: [
        {
          fields: {
            Content: contentValue, // Now, content is a string
          },
        },
      ],
    }
    console.log("payload without uri  ", payload)
  }

  // Now stringify the entire data object properly
  try {
    // Step 1: Create the record
    const createResponse = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    })

    // Get the created record's ID
    const recordId = createResponse.data.records[0].id
    console.log("Created record ID:", recordId)

    // Generate the output URL for the created record
    const outputUrl = `https://airtable.com/${baseId}/${tableId}/${recordId}`
    console.log("Output URL:", outputUrl)

    // Step 2: Update the created record with the output URL
    const updatePayload = {
      records: [
        {
          id: recordId, // Use the recordId of the created record
          fields: {
            Content: `${contentValue}\n\nOutput URL: ${outputUrl}`, // Add the output URL to the existing content
          },
        },
      ],
    }

    // Perform the update to the record
    const updateResponse = await axios.patch(url, updatePayload, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    })

    console.log("Updated record with output URL:", updateResponse.data)

    return uri === CLOUD_EVENT_API_URL ? outputUrl : uri
  } catch (error) {
    console.error(
      "Error uploading data to Airtable:",
      error.response?.data || error.message
    )
    throw new Error(error)
  }
}

function extractBaseAndTableIdsFromApiUrl(url) {
  const regex = /https:\/\/api\.airtable\.com\/v0\/([^\/]+)\/([^\/]+)\//
  const match = url.match(regex)

  if (match && match.length === 3) {
    const baseId = match[1]
    const tableId = match[2]
    return { baseId, tableId }
  } else {
    throw new Error("Invalid Airtable API URL format.")
  }
}



const getAirtableFields = async (uri) => {
  const { baseId, tableId } = extractAirtableIds(uri);
  const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;
  const headers = {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
  };

  try {
    const response = await axios.get(url, { headers });
    const records = response.data.records;

    if (records.length > 0) {
      // Assuming the first record contains all the fields (not guaranteed)
      const firstRecordFields = records[0].fields;
      console.log(
        "Fields found in the first record:",
        Object.keys(firstRecordFields)
      );
      return Object.keys(firstRecordFields);
    }
  } catch (error) {
    console.error("Error fetching Airtable records:", error.message);
    throw new error
  }
};

// Fallback Generic XSLT
const genericXslt = `https://airtable.com/appW7fUkTEqqte9Jc/tblKrfebiQ84S7gDr/viwa6xdcNYZfpr0uU/reci9tObSnR38Myne/fldqKo5KjCX98Ew0R?copyLinkToCellOrRecordOrigin=gridView
`;

function normalizeString(input) {
  return input
    .trim() // Remove leading and trailing whitespace
    .replace(/\n+/g, "") // Replace multiple newlines with a single newline
    .replace(/ {2,}/g, " ") // Replace multiple spaces with a single space
    .replace(/\t/g, " ") // Replace tabs with spaces (optional)
    .split("\n") // Split into an array of lines
    .map((line, index) => {
      // Remove leading whitespace only for lines that are not the first
      if (index > 0) {
        return line.replace(/^\s+/, ""); // Remove leading spaces from lines (except the first)
      }
      return line; // Return the first line as it is
    })
    .join("\n") // Join back into a single string with newlines
    .replace(/^\s+/gm, "") // Clean up any leading spaces for all lines
    .replace(/\s+$/gm, ""); // Clean up any trailing spaces for all lines
}
// function normalizeToXml(input) {
//   try {
//     // If input is already an object (likely JSON)
//     if (typeof input === "object" && input !== null) {
//       logSteps.push("Detected JSON input.");
//       return json2xml(input, { compact: true });
//     }
//     // If input is a string, check if it's JSON, XML, or YAML
//     else if (typeof input === "string") {
//       try {
//         // Try parsing as XML
//         const xmlTest = new XmlParser().xmlParse(input);
//         logSteps.push("Detected XML input.");
//         return input;
//       } catch (e) {
//         // If XML parsing fails, try parsing as YAML
//         try {
//           const yamlData = yaml.load(input);
//           logSteps.push("Detected YAML input.");
//           return json2xml(normalizeString(yamlData), { compact: true });
//         } catch (yamlError) {
//           // If both XML and YAML parsing fail, attempt JSON parsing
//           try {
//             const jsonData = JSON.parse(input);
//             logSteps.push("Detected JSON input from string.");
//             return json2xml(jsonData, { compact: true });
//           } catch (jsonError) {
//             throw new Error("Invalid YAML, XML, or JSON format.");
//           }
//         }
//       }
//     } else {
//       // If input is neither object nor string, it's unsupported
//       throw new Error("Unsupported input format.");
//     }
//   } catch (error) {
//     // Return a clear error message and log the step
//     logSteps.push(`Error normalizing input: ${error.message}`);
//     return null;
//   }
// }


// Lambda function handler
exports.handler = async (event) => {
  logSteps = []

  try {
    // const body = event
    const body = JSON.parse(event.body)

    const inputKeys = Object.keys(body)

    // Initialize an object to store input data
    const inputData = {}
        // Fetch data from Airtable for each input key (URL)
    const verbose = body["verbose"] === true // Check if 'verbose' is true
    let out_YAML;
    let out_JSON;
    let out_XML;


    // Fetch data from Airtable for each input key (URL), excluding 'verbose'
    for (const format of inputKeys) {
      const value = body[format]

      if (format !== "verbose" && value) {
        // Only process if it's not 'verbose' and the value exists
        inputData[format] = await fetchAirtableData(value)
        logSteps.push(`Fetched data for ${format} from Airtable URL: ${value}`)
      }
    }

    if (Object.keys(inputData).length === 0) {
      throw new Error(
        "At least one input (in_YAML, in_JSON, in_XML) is required."
      )
    }
    // let verbose = inputData["verbose"] === true // Set verbose flag once

    if (
      inputKeys.includes("in_YAML") &&
      !inputKeys.includes("in_JSON") &&
      !inputKeys.includes("in_XML")
    ) {

      const result = await validateYAML(inputData["in_YAML"], logSteps, verbose)
      logSteps.push(...result.logSteps)

        if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    // If only in_JSON is present
    if (
      inputKeys.includes("in_JSON") &&
      !inputKeys.includes("in_YAML") &&
      !inputKeys.includes("in_XML")
    ) {
      const result = await validateJSON(inputData["in_JSON"], logSteps, verbose)
      logSteps.push(...result.logSteps)

      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    // If only in_XML is present
    if (
      inputKeys.includes("in_XML") &&
      !inputKeys.includes("in_YAML") &&
      !inputKeys.includes("in_JSON") &&
      !inputKeys.includes("in_XSD")
    ) {
      const result = await validateXML(inputData["in_XML"], logSteps, verbose)
      logSteps.push(...result.logSteps)

      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    if (
      inputKeys.includes("in_XSLT") &&
      !inputKeys.includes("in_XML") &&
      !inputKeys.includes("in_YAML") &&
      !inputKeys.includes("in_JSON")
    ) {
      const result = await validateXSLT(inputData["in_XSLT"], logSteps, verbose)
      logSteps.push(...result.logSteps)

      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    // Handle validation for each input format or combination of formats
    if (
      inputKeys.includes("in_YAML") &&
      inputKeys.includes("in_JSON") &&
      !inputKeys.includes("in_XML") &&
      !inputKeys.includes("in_XSD")
    ) {
      // If both in_YAML and in_JSON are present
      const result = await validateYAMLAndJSON(
        inputData["in_YAML"],
        inputData["in_JSON"],
        verbose
      )

      logSteps.push(...result.logSteps)
      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    if (
      inputKeys.includes("in_YAML") &&
      inputKeys.includes("in_XML") &&
      !inputKeys.includes("in_JSON") &&
      !inputKeys.includes("in_XSD")
    ) {
      // If both in_YAML and in_XML are present
      const result = await validateYAMLAndXML(
        inputData["in_YAML"],
        inputData["in_XML"],
        verbose
      )

      logSteps.push(...result.logSteps)
      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    if (
      inputKeys.includes("in_JSON") &&
      inputKeys.includes("in_XML") &&
      !inputKeys.includes("in_YAML") &&
      !inputKeys.includes("in_XSD")
    ) {
      // If both in_JSON and in_XML are present
      const result = await validateJSONAndXML(
        inputData["in_JSON"],
        inputData["in_XML"],
        verbose
      )

      logSteps.push(...result.logSteps)
      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    if (
      inputKeys.includes("in_YAML") &&
      inputKeys.includes("in_JSON") &&
      inputKeys.includes("in_XML") &&
      !inputKeys.includes("in_XSD")
    ) {
      // If all three formats are present
      const result = await validateYAMLandJSONandXML(
        inputData["in_YAML"],
        inputData["in_JSON"],
        inputData["in_XML"],
        verbose
      )

      logSteps.push(...result.logSteps)
      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    if (
      inputKeys.includes("in_XML") &&
      inputKeys.includes("in_XSD") &&
      !inputKeys.includes("in_JSON") &&
      !inputKeys.includes("in_YAML")
    ) {
      // If both in_XML and in_XSD are present
      const result = await validateXMLAndXSD(
        inputData["in_XML"],
        inputData["in_XSD"],
        verbose
      )

      logSteps.push(...result.logSteps)
      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    if (
      inputKeys.includes("in_JSON") &&
      inputKeys.includes("in_XML") &&
      inputKeys.includes("in_XSD") &&
      !inputKeys.includes("in_YAML")
    ) {
      // Call the function with the appropriate parameters
      const result = await validateJSONAndXMLAndXSD(
        inputData["in_JSON"],
        inputData["in_XML"],
        inputData["in_XSD"],
        verbose
      )
      // Push the logs into logSteps

      logSteps.push(...result.logSteps)
      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    if (
      inputKeys.includes("in_YAML") &&
      inputKeys.includes("in_XML") &&
      inputKeys.includes("in_XSD") &&
      !inputKeys.includes("in_JSON")
    ) {
      // Call the function with in_YAML, in_XML, and in_XSD
      const result = await validateYAMLandXMLandXSD(
        inputData["in_YAML"],
        inputData["in_XML"],
        inputData["in_XSD"],
        verbose
      )

      // Push the logs into logSteps

      logSteps.push(...result.logSteps)
      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    if (
      inputKeys.includes("in_YAML") &&
      inputKeys.includes("in_JSON") &&
      inputKeys.includes("in_XML") &&
      inputKeys.includes("in_XSD") &&
      !inputKeys.includes("in_XSLT")
    ) {
      // Call the function with all inputs
      const result = await validateYAMLAndJSONAndXMLAndXSD(
        inputData["in_YAML"],
        inputData["in_JSON"],
        inputData["in_XML"],
        inputData["in_XSD"],
        verbose
      )

      // Push the logs into logSteps

      logSteps.push(...result.logSteps)
      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    if (
      inputKeys.includes("in_YAML") &&
      inputKeys.includes("in_JSON") &&
      inputKeys.includes("in_XML") &&
      inputKeys.includes("in_XSD") &&
      inputKeys.includes("in_XSLT") &&
      !inputKeys.includes("out_XSD")
    ) {
      // Call the function with all inputs
      const result = await validateAll(
        inputData["in_YAML"],
        inputData["in_JSON"],
        inputData["in_XML"],
        inputData["in_XSD"],
        inputData["in_XSLT"],
        verbose
      )

      // Push the logs into logSteps

      logSteps.push(...result.logSteps)
      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`JSON uploaded to Airtable: ${out_JSON}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    if (
      inputKeys.includes("in_YAML") &&
      inputKeys.includes("in_JSON") &&
      inputKeys.includes("in_XML") &&
      inputKeys.includes("in_XSD") &&
      inputKeys.includes("in_XSLT") &&
      inputKeys.includes("out_XSD")
    ) {
      // Call the function with all inputs
      const result = await validateWithOutXSD(
        inputData["in_YAML"],
        inputData["in_JSON"],
        inputData["in_XML"],
        inputData["in_XSD"],
        inputData["in_XSLT"],
        inputData["out_XSD"],
        verbose
      )

      // Push the logs into logSteps

      logSteps.push(...result.logSteps)
      if (result.out_YAML) {
        out_YAML = await uploadToAirtable(
          result.out_YAML
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

          // Uploading out_JSON content to Airtable
      if (result.out_JSON) {
        out_JSON = await uploadToAirtable(
          result.out_JSON
        );
        logSteps.push(`YAML uploaded to Airtable: ${out_YAML}`)
      }

      // Uploading out_XML content to Airtable
      if (result.out_XML) {
        out_XML = await uploadToAirtable(
          result.out_XML
        );
        logSteps.push(`XML uploaded to Airtable: ${out_XML}`)
      }
    }

    if (inputKeys.include("in_YAML") &&
        inputKeys.include("plus_YAML") &&
        inputKeys.include("aggregate_XSLT") &&
        inputKeys.include("out_XML")
    ) {
        const result = await validateCase13(
          inputData["plus_YAML"],
          inputData["aggregate_XSLT"],
          inputData["in_YAML"],
          inputData["out_XML"]
        )
      }

      if (inputKeys.include("plus_YAML") && inputKeys.include("aggregate_XSLT") &&  inputKeys.include("in_YAML"), verbose){

        const result = await handleCasePlusYAMLAggregateXSLTInYAML(
          inputData["plus_YAML"],
          inputData["aggregate_XSLT"],
          inputData["in_YAML"],
          verbose
        )
        logSteps.push(...result.logSteps)
        if (result.plus_JSON) {
          plus_JSON = await uploadToAirtable(plus_JSON)
          logSteps.push(`plus_JSON uploaded to Airtable: ${plus_JSON}`)
        }

        if (result.plus_XML) {
          plus_XML = await uploadToAirtable(plus_XML)
          logSteps.push(`plus_XML uploaded to Airtable: ${plus_XML}`)
        }

        // if (plus_XSD) {
        //   plus_XSD = await uploadToAirtable(plus_XSD);
        //   logSteps.push(`plus_XSD uploaded to Airtable: ${plus_XSD}`);
        // }

        if (result.in_JSON) {
          in_JSON = await uploadToAirtable(in_JSON)
          logSteps.push(`in_JSON uploaded to Airtable: ${in_JSON}`)
        }

        if (in_XML) {
          in_XML = await uploadToAirtable(in_XML)
          logSteps.push(`in_XML uploaded to Airtable: ${in_XML}`)
        }

        // if (in_XSD) {
        //   in_XSD = await uploadToAirtable(in_XSD);
        //   logSteps.push(`in_XSD uploaded to Airtable: ${in_XSD}`);
        // }

        if (result.aggregate_XML) {
          aggregate_XML = await uploadToAirtable(aggregate_XML)
          logSteps.push(`aggregate_XML uploaded to Airtable: ${aggregate_XML}`)
        }

        // if (aggregate_XSD) {
        //   aggregate_XSD = await uploadToAirtable(aggregate_XSD);
        //   logSteps.push(`aggregate_XSD uploaded to Airtable: ${aggregate_XSD}`);
        // }

        // if (XSLT) {
        //   XSLT = await uploadToAirtable(XSLT);
        //   logSteps.push(`XSLT uploaded to Airtable: ${XSLT}`);
        // }

        if (result.out_YAML) {
          out_YAML = await uploadToAirtable(out_YAML)
          logSteps.push(`out_YAML uploaded to Airtable: ${out_YAML}`)
        }

        if (result.out_JSON) {
          out_JSON = await uploadToAirtable(out_JSON)
          logSteps.push(`out_JSON uploaded to Airtable: ${out_JSON}`)
        }

        if (result.out_XML) {
          out_XML = await uploadToAirtable(out_XML)
          logSteps.push(`out_XML uploaded to Airtable: ${out_XML}`)
        }

        // if (out_XSD) {
        //   out_XSD = await uploadToAirtable(out_XSD);
        //   logSteps.push(`out_XSD uploaded to Airtable: ${out_XSD}`);
        // }
      }


      if (
        (inputKeys.include("plus_YAML") &&
          inputKeys.include("aggregate_XSLT") &&
          inputKeys.include("in_JSON"),
        verbose)
      ) {
        const result = await handleCasePlusYAMLAggregateXSLTInJSON(
          inputData["plus_YAML"],
          inputData["aggregate_XSLT"],
          inputData["in_JSON"],
          verbose
        )
        logSteps.push(...result.logSteps)
        if (plus_JSON) {
          plus_JSON = await uploadToAirtable(plus_JSON)
          logSteps.push(`plus_JSON uploaded to Airtable: ${plus_JSON}`)
        }

        if (plus_XML) {
          plus_XML = await uploadToAirtable(plus_XML)
          logSteps.push(`plus_XML uploaded to Airtable: ${plus_XML}`)
        }

        // if (plus_XSD) {
        //   plus_XSD = await uploadToAirtable(plus_XSD);
        //   logSteps.push(`plus_XSD uploaded to Airtable: ${plus_XSD}`);
        // }

        if (in_YAML) {
          in_YAML = await uploadToAirtable(in_YAML)
          logSteps.push(`in_JSON uploaded to Airtable: ${in_YAML}`)
        }

        if (in_XML) {
          in_XML = await uploadToAirtable(in_XML)
          logSteps.push(`in_XML uploaded to Airtable: ${in_XML}`)
        }

        // if (in_XSD) {
        //   in_XSD = await uploadToAirtable(in_XSD);
        //   logSteps.push(`in_XSD uploaded to Airtable: ${in_XSD}`);
        // }

        if (aggregate_XML) {
          aggregate_XML = await uploadToAirtable(aggregate_XML)
          logSteps.push(`aggregate_XML uploaded to Airtable: ${aggregate_XML}`)
        }

        // if (aggregate_XSD) {
        //   aggregate_XSD = await uploadToAirtable(aggregate_XSD);
        //   logSteps.push(`aggregate_XSD uploaded to Airtable: ${aggregate_XSD}`);
        // }

        // if (XSLT) {
        //   XSLT = await uploadToAirtable(XSLT);
        //   logSteps.push(`XSLT uploaded to Airtable: ${XSLT}`);
        // }

        if (out_YAML) {
          out_YAML = await uploadToAirtable(out_YAML)
          logSteps.push(`out_YAML uploaded to Airtable: ${out_YAML}`)
        }

        if (out_JSON) {
          out_JSON = await uploadToAirtable(out_JSON)
          logSteps.push(`out_JSON uploaded to Airtable: ${out_JSON}`)
        }

        if (out_XML) {
          out_XML = await uploadToAirtable(out_XML)
          logSteps.push(`out_XML uploaded to Airtable: ${out_XML}`)
        }

        // if (out_XSD) {
        //   out_XSD = await uploadToAirtable(out_XSD);
        //   logSteps.push(`out_XSD uploaded to Airtable: ${out_XSD}`);
        // }
      }

    const output = await uploadToCloudEvent(logSteps)
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify({
        logSteps, // Logs from the validation process
        output, // Airtable upload URL
        ...(verbose && {
          out_YAML: out_YAML,
          out_JSON: out_JSON,
          out_XML: out_XML,
        }), // Include only in verbose mode
      }),
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
      body: JSON.stringify({
        error: error.message,
        logSteps: logSteps,
      }),
    }
  }
}


function extractAirtableIds(url) {
  const regex = /airtable\.com\/([^/]+)\/([^/]+)\/[^/]+\/([^/]+)/;
  const match = url.match(regex);

  if (match && match.length === 4) {
    const baseId = match[1];
    const tableId = match[2];
    const recordId = match[3];
    return { baseId, tableId, recordId };
  } else {
    throw new Error("Invalid Airtable URL format.");
  }
}

const parseJsonStrings = (data) => {
  // Loop through all properties of the object
  if (typeof data === "object" && data !== null) {
    for (let key in data) {
      if (typeof data[key] === "string") {
        try {
          // Try parsing any string that looks like JSON
          data[key] = JSON.parse(data[key]);
        } catch (e) {
          // If it doesn't parse correctly, just leave it as is
        }
      } else if (typeof data[key] === "object") {
        // Recursively parse objects
        parseJsonStrings(data[key]);
      }
    }
  }
  return data;
};

// Validate YAML
function validateYAML(inputData, logSteps, verbose = false) {
  try {
    // Validate the YAML input
    inputData = normalizeYAML(inputData)
    yaml.load(inputData)
    logSteps.push("YAML validation succeeded.")

    if (verbose) {
      // Perform conversions
      const out_JSON = YAMLtoJSON(inputData)
      logSteps.push("YAML successfully converted to JSON.")

      const out_XML = YAMLtoXML(inputData)
      logSteps.push("YAML successfully converted to XML.")

      // Return the results in verbose mode
      return {
        logSteps,
        out_YAML: inputData, // Original YAML string
        out_JSON: out_JSON, // JSON conversion
        out_XML: out_XML, // XML conversion
      }
    }

    // Return only validation status and logSteps for non-verbose mode
    return {
      success: true,
      logSteps,
    }
  } catch (e) {
    // Log the error
    logSteps.push(`YAML validation failed: ${e.message}`)

    // Return validation status and logSteps
    return {
      success: false,
      logSteps,
    }
  }
}



// Validate JSON
function validateJSON(inputData, logSteps, verbose = false) {
  try {
    // Validate the JSON input
    const parsedJSON = JSON.parse(inputData)
    logSteps.push("JSON validation succeeded.")

    if (verbose) {
      // Perform the JSON to XML conversion
      const out_XML = JSONtoXML(parsedJSON)
      logSteps.push("JSON successfully converted to XML.")

      // Return detailed output in verbose mode
      return {
        logSteps,
        out_JSON: parsedJSON, // Parsed JSON object
        out_XML: out_XML, // XML representation
      }
    }

    // Return only validation status and logSteps for non-verbose mode
    return {
      success: true,
      logSteps,
    }
  } catch (e) {
    // Log the error
    logSteps.push(`JSON validation failed: ${e.message}`)

    // Return validation status and logSteps
    return {
      success: false,
      logSteps,
    }
  }
}



function normalizeJSON(inputJSON) {
  try {
    // Parse the input JSON string into an object to remove any extra spaces or formatting
    const parsedObject = JSON.parse(inputJSON)

    // Convert the object back into a compact JSON string with no extra spaces
    return JSON.stringify(parsedObject)
  } catch (error) {
    throw new Error("Invalid JSON format")
  }
}

// Validate XML
function validateXML(inputData, logSteps, verbose = false) {
  try {
    libxmljs.parseXml(inputData)
    logSteps.push("XML validation succeeded.")
    if (verbose) {
      return {
        logSteps,
        success: true,
        out_XML: inputData,
      }
    }
    return {
      success: true,
      logSteps,
    }
  } catch (e) {
    logSteps.push(`XML validation failed: ${e.message}`)
    if (verbose) {
      return {
        logSteps,
        success: false,
        error: e.message,
      }
    }
    return {
      success: false,
      logSteps,
    }
  }
}


// Validate XSD
function validateXSD(inputData, xsdSchema, logSteps) {
  return new Promise((resolve) => {
    try {
      // Ensure that xsdSchema and inputData are valid XML strings
      if (!inputData || !xsdSchema) {
        logSteps.push("XSD validation failed: Missing XML or schema data.")
        resolve(false)
        return
      }

      // Parse both input XML and XSD schema to ensure proper validation
      const xmlDoc = libxmljs.parseXml(inputData) // Ensure inputData is parsed XML
      const xsdDoc = libxmljs.parseXml(xsdSchema) // Ensure xsdSchema is parsed
      // Validate XML against the XSD schema
      if (xmlDoc.validate(xsdDoc)) {
        logSteps.push("XSD validation succeeded.")
        resolve(true)
      } else {
        logSteps.push(
          "XSD validation failed: XML does not comply with the XSD schema."
        )
        console.log(
          "XSD validation failed: XML does not comply with the XSD schema."
        )
        resolve(false)
      }
    } catch (e) {
      logSteps.push(`XSD validation failed: ${e.message}`)
      resolve(false)
    }
  })
}


// Validate XSLT
function validateXSLT(inputData, logSteps, verbose = false) {
  try {
    libxmljs.parseXml(inputData) // XSLT can be parsed as XML
    logSteps.push("XSLT validation succeeded.")
    return {
      success: true,
      logSteps,
    }
  } catch (e) {
    logSteps.push(`XSLT validation failed: ${e.message}`)
    return {
      success: false,
      logSteps,
    }
  }
}


async function validateYAMLAndJSON(in_YAML, in_JSON, verbose = false) {
  const logSteps = []
  let out_JSON, out_XML

  try {
    // Normalize the YAML input
    in_YAML = normalizeYAML(in_YAML)
  } catch (error) {
    logSteps.push("Error normalizing YAML: " + error.message)
  }

  // Validate in_YAML
  let result = await validateYAML(in_YAML, logSteps)

  const isYAMLValid = result.success
  logSteps.push(
    `in_YAML validation result: ${
      isYAMLValid ? "Success: YAML is valid" : "Error: YAML is invalid"
    }`
  )

  // Validate in_JSON
  result = await validateJSON(in_JSON, logSteps)
  const isJSONValid = result.success
  logSteps.push(
    `in_JSON validation result: ${
      isJSONValid ? "Success: JSON is valid" : "Error: JSON is invalid"
    }`
  )

  // Proceed if both are valid
  if (isYAMLValid && isJSONValid) {
    try {
      // Convert YAML to JSON
      const yamlToJson = YAMLtoJSON(in_YAML)

      // Normalize the input JSON
      const normalizedJson = normalizeJSON(in_JSON)

      // Compare normalized YAML-to-JSON and normalized input JSON
      const isEqual = JSON.stringify(yamlToJson) === normalizedJson

      if (isEqual) {
        logSteps.push("Success: in_YAML equals in_JSON, both are valid")
      } else {
        logSteps.push("Error: in_YAML does not equal in_JSON")
      }

      // If verbose, perform additional conversions
      if (verbose) {
        out_JSON = yamlToJson // Save the YAML-to-JSON conversion
        out_XML = YAMLtoXML(in_YAML) // Convert YAML to XML
      }
    } catch (error) {
      logSteps.push(
        "Error: Failed to convert in_YAML to JSON or compare with in_JSON"
      )
    }
  }

  // Prepare the return object
  if (verbose) {
    return {
      logSteps,
      out_YAML: in_YAML,
      out_JSON: out_JSON, // Will be undefined if not set
      out_XML: out_XML, // Will be undefined if not set
    }
  }

  return {
    success: true,
    logSteps
  } // Return only logSteps in non-verbose mode
}


function YAMLtoJSON(yamlString) {
  try {
    const parsedYaml = yaml.load(yamlString) // Parse the YAML string into a JavaScript object
    const keys = Object.keys(parsedYaml)
    // If the root key's value is null, remove that key and return the rest of the object
    if (keys.length > 0 && parsedYaml[keys[0]] === null) {
      const { [keys[0]]: nullKey, ...rest } = parsedYaml // Dynamically remove the null root key
      return { [keys[0]]: rest } // Return the root key with the rest of the object as its value
    }
    return parsedYaml
    // If no null root key, return the object as is
  } catch (error) {
    throw new Error("Invalid YAML format") // Handle any parsing errors
  }
}


async function XMLtoYAML(xmlString) {
  try {
    const jsonObject = await XMLtoJSON(xmlString) // First convert XML to JSON
    const yamlString = yaml.dump(jsonObject, { noRefs: true })
    console.log("Successfully converted XML to YAML.")
    return yamlString
  } catch (error) {
    console.error("Error during XML to YAML conversion:", error.message)
    throw new Error("Error in XML to YAML conversion: " + error.message)
  }
}


async function XMLtoJSON(xmlString) {
  try {
    const parser = new xml2js.Parser({ explicitArray: false })
    const jsonObject = await parser.parseStringPromise(xmlString)
    console.log("Successfully converted XML to JSON.")
    return jsonObject
  } catch (error) {
    console.error("Error during XML to JSON conversion:", error.message)
    throw new Error("Error in XML to JSON conversion: " + error.message)
  }
}




function YAMLtoXML(yamlString) {
  try {
     // Parse YAML to JSON
    const jsonObject = yaml.load(yamlString)

    // Find the key that has a null value, and use it as the root element
    const rootTag = Object.keys(jsonObject).find(
      (key) => jsonObject[key] === null
    )
    if (!rootTag) {
      throw new Error(
        "No key with a null value found to use as the root element."
      )
    }

    // Remove the null value element before wrapping
    delete jsonObject[rootTag]

    // Create a wrapper object where the rootTag contains its children
    const wrappedObject = { [rootTag]: jsonObject }
    // Convert JSON to XML using xml2js Builder
    const builder = new xml2js.Builder({
      headless: true,
      renderOpts: { pretty: false }, // No pretty formatting, compact XML
      xmldec: { version: "1.0", encoding: "UTF-8" },
      explicitArray: false,
    })

    let xmlString = builder.buildObject(wrappedObject)

    return xmlString
  } catch (error) {
    console.error("Error during YAML to XML conversion:", error.message)
    throw new Error("Error in YAML to XML conversion: " + error.message)
  }
}

function JSONtoXML(json, rootElement = "root") {
  const convertToXML = (obj) => {
    let xml = ""

    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key]

        if (typeof value === "object" && value !== null) {
          // If value is an array, handle each item separately
          if (Array.isArray(value)) {
            value.forEach((item) => {
              xml += `<${key}>${convertToXML(item)}</${key}>`
            })
          } else {
            // If value is a nested object, recursively process it
            xml += `<${key}>${convertToXML(value)}</${key}>`
          }
        } else {
          // If value is a primitive, directly wrap it in XML tags
          xml += `<${key}>${escapeXML(value)}</${key}>`
        }
      }
    }

    return xml
  }

  // Escape special XML characters
  const escapeXML = (value) => {
    if (typeof value !== "string") return value
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  }

  // Start with the root element
  return `${convertToXML(json)}`
}



async function transformXMLUsingXSLT(in_XML, in_XSLT) {
  const xsltProcessor = new Xslt()
  const xmlParser = new XmlParser()
  let transformedXml
  try {
    transformedXml = await xsltProcessor.xsltProcess(
      xmlParser.xmlParse(in_XML),
      xmlParser.xmlParse(in_XSLT)
    )
    logSteps.push("Successfully applied provided XSLT transformation.")
    return transformedXml

  } catch (error) {
    logSteps.push(`XSLT transformation failed: ${error.message}`)
    return false
  }
}

async function validateYAMLAndXML(in_YAML, in_XML, verbose = false) {
  const logSteps = []
  let isValidYAML = false
  let isValidXML = false
  let out_XML, out_JSON

  try {
    in_YAML = normalizeYAML(in_YAML) // Normalize the YAML input to ensure proper formatting
  } catch (error) {
    logSteps.push("Error normalizing YAML: " + error.message)
  }

  // Validate in_YAML
  try {
    if (await validateYAML(in_YAML, logSteps)) {
      isValidYAML = true
    } else {
      logSteps.push("YAML is invalid")
    }
  } catch (error) {
    logSteps.push("Error validating YAML: " + error.message)
  }

  // Validate in_XML
  try {
    if (await validateXML(in_XML, logSteps)) {
      isValidXML = true
    } else {
      logSteps.push("XML is invalid")
    }
  } catch (error) {
    logSteps.push("Error validating XML: " + error.message)
  }

  // Proceed if both are valid
  if (isValidYAML && isValidXML) {
    try {
      // Normalize the XML input
      in_XML = normalizeXML(in_XML)
      // Convert YAML to XML
      out_XML = YAMLtoXML(in_YAML)

      // Compare the converted XML with the provided in_XML
      if (out_XML === in_XML) {
        logSteps.push("Success: in_YAML equals in_XML, both are valid")
      } else {
        logSteps.push("Error: in_YAML does not equal in_XML")
      }

      // If verbose, convert YAML to JSON as well
      if (verbose) {
        out_JSON = YAMLtoJSON(in_YAML) // Convert YAML to JSON
      }
    } catch (error) {
      logSteps.push(
        "Error: Failed to convert in_YAML to XML or compare with in_XML"
      )
    }
  }

  // Prepare the return object
  if (verbose) {
    return {
      logSteps,
      out_YAML: in_YAML,
      out_JSON: out_JSON, // Result of YAML to XML conversion
      out_XML: out_XML, // Result of YAML to JSON conversion (if verbose)
    }
  }
  return {
    success: true,
    logSteps,
  } // Return only logSteps in non-verbose mode // Return only logSteps in non-verbose mode
}


async function validateJSONAndXML(in_JSON, in_XML, verbose = false) {
  const logSteps = []
  let out_XML, out_JSON

  // Validate in_JSON
  logSteps.push("Validating in_JSON...")
  let result = await validateJSON(in_JSON, logSteps)
  let isJSONValid = result.success
  logSteps.push(
    `in_JSON validation result: ${
      isJSONValid ? "Success: JSON is valid" : "Error: JSON is invalid"
    }`
  )

  try {
    // Convert in_JSON to a JavaScript object if it's a string
    if (typeof in_JSON === "string") {
      logSteps.push("in_JSON is a string, attempting to parse...")
      try {
        in_JSON = JSON.parse(in_JSON)
        logSteps.push("Success: in_JSON successfully parsed into an object")
      } catch (parseError) {
        logSteps.push("Error: Failed to parse in_JSON into an object")
        return logSteps // Exit early if JSON is invalid
      }
    } else {
      logSteps.push("in_JSON is already an object, skipping parsing.")
    }

    // Validate in_XML
    logSteps.push("Validating in_XML...")
    result = await validateXML(in_XML, logSteps)
    let isXMLValid = result.success
    logSteps.push(
      `in_XML validation result: ${
        isXMLValid ? "Success: XML is valid" : "Error: XML is invalid"
      }`
    )

    // Proceed if both are valid
    if (isJSONValid && isXMLValid) {
      logSteps.push(
        "Both JSON and XML are valid. Proceeding with conversion and comparison..."
      )
      try {
        // Convert JSON to XML
        logSteps.push("Attempting to convert JSON to XML...")
        out_XML = JSONtoXML(in_JSON)
        logSteps.push("Success: JSON successfully converted to XML")

        // Compare the generated XML with the input XML
        logSteps.push("Comparing generated XML with input XML...")
        in_XML = removeSpacesFromXML(in_XML)
        const isEqual = out_XML.trim() === in_XML.trim()

        if (isEqual) {
          logSteps.push("Success: in_JSON equals in_XML, both are valid")
        } else {
          logSteps.push("Error: in_JSON does not equal in_XML")
        }

        // If verbose, convert JSON to JSON as well
        if (verbose) {
          out_JSON = in_JSON // Return the final JSON object
          logSteps.push("Verbose mode: JSON data returned.")
        }
      } catch (conversionError) {
        logSteps.push(
          "Error: Failed to convert in_JSON to XML or compare with in_XML"
        )
        console.error("Conversion Error:", conversionError)
      }
    } else {
      logSteps.push("Validation failed: JSON or XML is invalid. Exiting...")
    }
  } catch (error) {
    logSteps.push("Error: Unexpected error during validation or comparison")
    console.error("Unexpected Error:", error)
  }

  // Return detailed information if verbose is true
  if (verbose) {
    return {
      logSteps,
      // out_YAML: in_YAML,
      out_JSON: out_JSON, // Result of YAML to XML conversion
      out_XML: in_XML, // Converted XML (if verbose)
    }
  }

  return {
    success: true,
    logSteps,
  } // Return only logSteps in non-verbose mode // Return only logSteps in non-verbose mode
}


function removeSpacesFromXML(xml) {
  // Remove extra spaces between tags and within tags
  return xml
    .replace(/>\s+</g, "><") // Remove spaces between tags
    .replace(/\s{2,}/g, " ") // Replace multiple spaces with a single space
    .replace(/>\s+/g, ">") // Remove trailing spaces after a tag
    .replace(/\s+</g, "<") // Remove leading spaces before a tag
    .trim() // Remove leading and trailing spaces
}


async function validateYAMLandJSONandXML(in_YAML, in_JSON, in_XML, verbose = false){
  const logSteps = []
  let isValidYAML = false
  let isValidJSON = false
  let isValidXML = false

  // Step 1: Validate YAML, JSON, and XML

  try {
    in_YAML = normalizeYAML(in_YAML) // Normalize the YAML input to ensure proper formatting
  } catch (error) {
    logSteps.push("Error normalizing YAML: " + error.message)
  }

  try {
    if (await validateYAML(in_YAML, logSteps)) {
      isValidYAML = true
      logSteps.push("YAML is valid")
    } else {
      logSteps.push("YAML is invalid")
    }
  } catch (error) {
    logSteps.push("Error validating YAML: " + error.message)
  }

  try {
    if (await validateJSON(in_JSON, logSteps)) {
      isValidJSON = true
      logSteps.push("JSON is valid")
    } else {
      logSteps.push("JSON is invalid")
    }
  } catch (error) {
    logSteps.push("Error validating JSON: " + error.message)
  }

  in_JSON = normalizeJSON(in_JSON, logSteps)
  // Convert in_JSON to a JavaScript object if it's a string
  if (typeof in_JSON === "string") {
    try {
      in_JSON = JSON.parse(in_JSON)
      logSteps.push("Success: in_JSON successfully parsed into an object")
    } catch (parseError) {
      logSteps.push("Error: Failed to parse in_JSON into an object")
      return logSteps // Exit early if JSON is invalid
    }
  }

  try {
    if (await validateXML(in_XML, logSteps)) {
      isValidXML = true
      logSteps.push("XML is valid")
    } else {
      logSteps.push("XML is invalid")
    }
  } catch (error) {
    logSteps.push("Error validating XML: " + error.message)
  }

  in_XML = normalizeXML(in_XML)
  // Step 2: Convert YAML and JSON to XML
  let convertedYAMLtoXML = ""
  let convertedJSONtoXML = ""

  try {
    if (isValidYAML) {
      convertedYAMLtoXML = await YAMLtoXML(in_YAML) // Convert YAML to XML
    }
  } catch (error) {
    logSteps.push("Error converting YAML to XML: " + error.message)
  }

  try {
    if (isValidJSON) {
      convertedJSONtoXML = await JSONtoXML(in_JSON) // Convert JSON to XML
    }
  } catch (error) {
    logSteps.push("Error converting JSON to XML: " + error.message)
  }

  // Step 3: Compare XMLs
  if (isValidYAML && isValidJSON && isValidXML) {
    if (
      convertedYAMLtoXML === convertedJSONtoXML &&
      convertedJSONtoXML === in_XML
    ) {
      logSteps.push(
        "Success: in_YAML equals in_JSON equals in_XML, all three are valid"
      )
    } else if (convertedYAMLtoXML !== in_XML && convertedJSONtoXML !== in_XML) {
      logSteps.push("Error: in_YAML and in_JSON are invalid")
    } else if (convertedYAMLtoXML !== in_XML) {
      logSteps.push("Error: in_YAML is invalid")
    } else if (convertedJSONtoXML !== in_XML) {
      logSteps.push("Error: in_JSON is invalid")
    }
  } else if (!isValidYAML && !isValidJSON && !isValidXML) {
    logSteps.push("Error: in_YAML, in_JSON, and in_XML are invalid")
  }

  if (verbose) {
    return {
      logSteps,
      out_YAML: in_YAML, // Final YAML input
      out_JSON: in_JSON, // Final JSON input
      out_XML: in_XML, // Final XML input
    }
  }

  // Return the validation steps
  return {
    success: true,
    logSteps,
  } // Return only logSteps in non-verbose mode
}

async function validateXMLAndXSD(in_XML, in_XSD, verbose = false) {
  const logSteps = []
  try {
    // Step 1: Validate XML (using the existing validateXML function)
    let result = await validateXML(in_XML, logSteps)
    let isXMLValid = result.success
    logSteps.push(
      `in_XML validation result: ${
        isXMLValid ? "Success: XML is valid" : "Error: XML is invalid"
      }`
    )
    // Step 2: Validate XSD (using the existing validateXSD function)
    const isXSDValid = await validateXSD(in_XML, in_XSD, logSteps) // Pass both XML data and XSD schema here
    logSteps.push(
      `in_XSD validation result: ${
        isXSDValid ? "Success: XSD is valid" : "Error: XSD is invalid"
      }`
    )

    // Step 3: If both XML and XSD are valid, proceed with XML validation against XSD
    if (isXMLValid && isXSDValid) {
      const xmlDoc = libxmljs.parseXml(in_XML) // Parse XML for further validation
      const xsdDoc = libxmljs.parseXml(in_XSD) // Parse XSD schema

      if (xmlDoc.validate(xsdDoc)) {
        logSteps.push("XML is compliant with the XSD")
      } else {
        logSteps.push("Error: XML is not compliant with the XSD")
      }
    }
  } catch (e) {
    logSteps.push("Error: " + e.message)
  }
  if (verbose){
    return {
      logSteps,
      out_XML: in_XML
    }
  }
  return {
    success: true,
    logSteps
  }
}


async function validateJSONAndXMLAndXSD(in_JSON, in_XML, in_XSD, verbose = false) {
  const logSteps = []

  let isValidJSON = false
  let isValidXML = false

  // Step 1: Validate JSON
  try {
    const jsonObject = JSON.parse(in_JSON) // Try to parse JSON
    isValidJSON = true
    logSteps.push("JSON is valid")
  } catch (error) {
    logSteps.push("Error: JSON is invalid")
  }

  // Convert in_JSON to a JavaScript object if it's a string
  if (typeof in_JSON === "string") {
    try {
      in_JSON = JSON.parse(in_JSON)
      logSteps.push("Success: in_JSON successfully parsed into an object")
    } catch (parseError) {
      logSteps.push("Error: Failed to parse in_JSON into an object")
      return logSteps // Exit early if JSON is invalid
    }
  }

  // Step 2: Convert JSON to XML
  let convertedJSONtoXML = ""
  if (isValidJSON) {
    try {
      convertedJSONtoXML = JSONtoXML(in_JSON) // Assume you have a function that converts JSON to XML
      logSteps.push("JSON converted to XML")
    } catch (error) {
      logSteps.push("Error: Failed to convert JSON to XML")
    }
  }

  // Step 3: Validate XML
  try {
    if (await validateXML(in_XML, logSteps)) {
      isValidXML = true
      logSteps.push("XML is valid")
    } else {
      logSteps.push("XML is invalid")
    }
  } catch (error) {
    logSteps.push("Error validating XML: " + error.message)
  }

  // Step 4: Validate XML against XSD
  const isXSDValid = await validateXSD(in_XML, in_XSD, logSteps) // Pass both XML data and XSD schema here
  logSteps.push(
    `in_XSD validation result: ${
      isXSDValid ? "Success: XSD is valid" : "Error: XSD is invalid"
    }`
  )

  // Step 5: Compare the converted JSON-to-XML with the original XML
  if (isValidJSON && isValidXML && isXSDValid) {
    in_XML = normalizeXML(in_XML)
    if (convertedJSONtoXML === in_XML) {
      logSteps.push("Success: JSON equals XML, all are valid and compliant")
    } else {
      logSteps.push("Error: JSON and XML do not match")
    }
  } else {
    logSteps.push("Error: One or more formats are invalid")
  }

  if (verbose) {
    return {
      logSteps,
      // out_YAML: in_YAML, // Final YAML input
      out_JSON: in_JSON, // Final JSON input
      out_XML: in_XML, // Final XML input
    }
  }

  return {
    success: true,
    logSteps,
  } // Return only logSteps in non-verbose mode
}

async function validateYAMLandXMLandXSD(in_YAML, in_XML, in_XSD, verbose = false) {
  const logSteps = []

  // Step 1: Validate YAML
  try {
    in_YAML = normalizeYAML(in_YAML) // Normalize the YAML input to ensure proper formatting
  } catch (error) {
    logSteps.push("Error normalizing YAML: " + error.message)
  }
  let result = await validateYAML(in_YAML, logSteps)
  const isValidYAML = result.success
  if (isValidYAML) {
    logSteps.push("YAML is valid")
  } else {
    logSteps.push("YAML is invalid")
  }

  // Step 2: Validate XML

  result = await validateXML(in_XML, logSteps)
  const isValidXML = result.success
  if (isValidXML) {
    logSteps.push("XML is valid")
  } else {
    logSteps.push("XML is invalid")
  }

  // Step 3: Validate XML against XSD
  const isCompliantXML = await validateXSD(in_XML, in_XSD, logSteps)
  if (isCompliantXML) {
    logSteps.push("XML is compliant with the XSD")
  } else {
    logSteps.push("XML is not compliant with the XSD")
  }

  // Step 4: Convert YAML to XML
  let convertedYAMLtoXML = ""
  if (isValidYAML) {
    try {
      convertedYAMLtoXML = YAMLtoXML(in_YAML) // Convert YAML to XML
    } catch (error) {
      logSteps.push("Error converting YAML to XML: " + error.message)
    }
  }

  // Step 5: Compare YAML-Converted XML with the Provided XML
  in_XML = normalizeXML(in_XML)
  if (isValidYAML && isValidXML && isCompliantXML) {
    if (convertedYAMLtoXML === in_XML) {
      logSteps.push(
        "Success: in_YAML equals in_XML, both are valid and compliant with XSD"
      )
    } else {
      logSteps.push("Error: Converted YAML XML does not match in_XML")
    }
  }
  const out_JSON = YAMLtoJSON(in_YAML)

  if (verbose) {
    return {
      logSteps,
      out_YAML: in_YAML, // Final YAML input
      out_JSON: out_JSON, // Final JSON input
      out_XML: in_XML, // Final XML input
    }
  }

  // Return the logs
  return {
    success: true,
    logSteps,
  } // Return only logSteps in non-verbose mode
}

async function validateYAMLAndJSONAndXMLAndXSD(in_YAML, in_JSON, in_XML, in_XSD, verbose = false) {
  const logSteps = []

  // Step 1: Validate YAML
  try {
    in_YAML = normalizeYAML(in_YAML) // Normalize the YAML input to ensure proper formatting
  } catch (error) {
    logSteps.push("Error normalizing YAML: " + error.message)
  }
  let result = await validateYAML(in_YAML, logSteps)
  const isValidYAML = result.success
  if (isValidYAML) {
    logSteps.push("YAML is valid")
  } else {
    logSteps.push("YAML is invalid")
  }

  // Step 2: Validate JSON
  result = await validateJSON(in_JSON, logSteps)
  const isJSONValid = result.success
  if (isJSONValid) {
    logSteps.push("JSON is valid")
  } else {
    logSteps.push("JSON is invalid")
  }

  try {
    in_JSON = JSON.parse(in_JSON)
    logSteps.push("Success: in_JSON successfully parsed into an object")
  } catch (parseError) {
    logSteps.push("Error: Failed to parse in_JSON into an object")
    return logSteps // Exit early if JSON is invalid
  }

  // Step 3: Validate XML
  result = await validateXML(in_XML, logSteps)
  const isValidXML = result.success
  if (isValidXML) {
    logSteps.push("XML is valid")
  } else {
    logSteps.push("XML is invalid")
  }

  // Step 4: Validate XML against XSD
  const isCompliantXML = await validateXSD(in_XML, in_XSD, logSteps)
  if (isCompliantXML) {
    logSteps.push("XML is compliant with the XSD")
  } else {
    logSteps.push("XML is not compliant with the XSD")
  }

  // Step 5: Convert YAML and JSON to XML
  let convertedYAMLtoXML = ""
  let convertedJSONtoXML = ""

  try {
    if (isValidYAML) {
      convertedYAMLtoXML = YAMLtoXML(in_YAML)
      logSteps.push("Successfully converted YAML to XML")
    }
  } catch (error) {
    logSteps.push("Error converting YAML to XML: " + error.message)
  }

  try {
    if (isJSONValid) {
      convertedJSONtoXML = JSONtoXML(in_JSON)
      logSteps.push("Successfully converted JSON to XML")
    }
  } catch (error) {
    logSteps.push("Error converting JSON to XML: " + error.message)
  }

  // Step 6: Compare XMLs
  in_XML = normalizeXML(in_XML)
  if (isValidYAML && isJSONValid && isValidXML && isCompliantXML) {
    if (
      convertedYAMLtoXML === convertedJSONtoXML &&
      convertedJSONtoXML === in_XML
    ) {
      logSteps.push(
        "Success: in_YAML equals in_JSON equals in_XML, all are valid and compliant with XSD"
      )
    } else {
      if (convertedYAMLtoXML !== in_XML) {
        logSteps.push("Error: Converted YAML XML does not match in_XML")
      }
      if (convertedJSONtoXML !== in_XML) {
        logSteps.push("Error: Converted JSON XML does not match in_XML")
      }
      if (convertedYAMLtoXML !== convertedJSONtoXML) {
        logSteps.push(
          "Error: Converted YAML XML does not match Converted JSON XML"
        )
      }
    }
  }

  if (verbose) {
    return {
      logSteps,
      out_YAML: in_YAML, // Final YAML input
      out_JSON: in_JSON, // Final JSON input
      out_XML: in_XML, // Final XML input
    }
  }

  // Step 7: Return the logs
  return {
    success: true,
    logSteps,
  } // Return only logSteps in non-verbose mode
}

async function validateAll(
  in_YAML,
  in_JSON,
  in_XML,
  in_XSD,
  in_XSLT,
  verbose = false
) {
  const logSteps = []

  // Step 1: Validate YAML
  try {
    in_YAML = normalizeYAML(in_YAML) // Normalize the YAML input to ensure proper formatting
  } catch (error) {
    logSteps.push("Error normalizing YAML: " + error.message)
  }
  let result = await validateYAML(in_YAML, logSteps)
  const isValidYAML = result.success
  logSteps.push(isValidYAML ? "YAML is valid" : "YAML is invalid")

  // Step 2: Validate JSON
  result = await validateJSON(in_JSON, logSteps)
  const isValidJSON = result
  logSteps.push(isValidJSON ? "JSON is valid" : "JSON is invalid")

  try {
    in_JSON = JSON.parse(in_JSON)
    logSteps.push("Success: in_JSON successfully parsed into an object")
  } catch (parseError) {
    logSteps.push("Error: Failed to parse in_JSON into an object")
    return logSteps // Exit early if JSON is invalid
  }

  // Step 3: Validate XML
  result = await validateXML(in_XML, logSteps)
  const isValidXML = result.success
  logSteps.push(isValidXML ? "XML is valid" : "XML is invalid")

  // Step 4: Validate XML against XSD
  const isCompliantXML = await validateXSD(in_XML, in_XSD, logSteps)
  logSteps.push(
    isCompliantXML
      ? "XML is compliant with XSD"
      : "XML is not compliant with XSD"
  )

  // Step 5: Convert YAML and JSON to XML
  let convertedYAMLtoXML = ""
  let convertedJSONtoXML = ""

  try {
    if (isValidYAML) {
      convertedYAMLtoXML = YAMLtoXML(in_YAML)
      logSteps.push("Successfully converted YAML to XML")
    }
  } catch (error) {
    logSteps.push("Error converting YAML to XML: " + error.message)
  }

  try {
    if (isValidJSON) {
      convertedJSONtoXML = JSONtoXML(in_JSON)
      logSteps.push("Successfully converted JSON to XML")
    }
  } catch (error) {
    logSteps.push("Error converting JSON to XML: " + error.message)
  }

  // Step 6: Compare XMLs
  in_XML = normalizeXML(in_XML)
  if (isValidYAML && isValidJSON && isValidXML && isCompliantXML) {
    if (
      convertedYAMLtoXML === convertedJSONtoXML &&
      convertedJSONtoXML === in_XML
    ) {
      logSteps.push(
        "Success: in_YAML equals in_JSON equals in_XML, all are valid and compliant with XSD"
      )
    } else {
      logSteps.push("Error: YAML, JSON, and XML are not equal")
    }
  }

  // Step 7: Apply XSLT Transformation
  try {
    if (isValidXML && isCompliantXML) {
      xsltResult = await transformXMLUsingXSLT(in_XML, in_XSLT)
      logSteps.push("Successfully applied XSLT transformation")
    } else {
      logSteps.push(
        "XML is either invalid or non-compliant, skipping transformation."
      )
    }
  } catch (error) {
    logSteps.push("Error applying XSLT transformation: " + error.message)
  }

  if (verbose) {
    return {
      logSteps,
      out_YAML: in_YAML, // Final YAML input
      out_JSON: in_JSON, // Final JSON input
      out_XML: xsltResult, // Final XML input
    }
  }
  // Return logs
  return {
    success: true,
    logSteps,
  } // Return only logSteps in non-verbose mode
}

async function validateWithOutXSD(
  in_YAML,
  in_JSON,
  in_XML,
  in_XSD,
  in_XSLT,
  out_XSD,
  verbose = false
) {
  const logSteps = []

  // Step 1: Validate YAML
  try {
    in_YAML = normalizeYAML(in_YAML) // Normalize the YAML input to ensure proper formatting
  } catch (error) {
    logSteps.push("Error normalizing YAML: " + error.message)
  }
  let result = await validateYAML(in_YAML, logSteps)
  let isValidYAML = result.success
  logSteps.push(isValidYAML ? "YAML is valid" : "YAML is invalid")

  // Step 2: Validate JSON
  result = await validateJSON(in_JSON, logSteps)
  let isValidJSON = result.success
  logSteps.push(isValidJSON ? "JSON is valid" : "JSON is invalid")

  try {
    in_JSON = JSON.parse(in_JSON)
    logSteps.push("Success: in_JSON successfully parsed into an object")
  } catch (parseError) {
    logSteps.push("Error: Failed to parse in_JSON into an object")
    return logSteps // Exit early if JSON is invalid
  }

  // Step 3: Validate XML
  result = await validateXML(in_XML, logSteps)
  let isValidXML = result.success
  logSteps.push(isValidXML ? "XML is valid" : "XML is invalid")

  // Step 4: Validate XML against input XSD
  const isCompliantWithInputXSD = await validateXSD(in_XML, in_XSD, logSteps)
  logSteps.push(
    isCompliantWithInputXSD
      ? "XML is compliant with input XSD"
      : "XML is not compliant with input XSD"
  )

  // Step 5: Convert YAML and JSON to XML
  let convertedYAMLtoXML = ""
  let convertedJSONtoXML = ""

  try {
    if (isValidYAML) {
      convertedYAMLtoXML = YAMLtoXML(in_YAML)
      logSteps.push("Successfully converted YAML to XML")
    }
  } catch (error) {
    logSteps.push("Error converting YAML to XML: " + error.message)
  }

  try {
    if (isValidJSON) {
      convertedJSONtoXML = JSONtoXML(in_JSON)
      logSteps.push("Successfully converted JSON to XML")
    }
  } catch (error) {
    logSteps.push("Error converting JSON to XML: " + error.message)
  }

  // Step 6: Compare XMLs
  in_XML = normalizeXML(in_XML)
  if (isValidYAML && isValidJSON && isValidXML && isCompliantWithInputXSD) {
    if (
      convertedYAMLtoXML === convertedJSONtoXML &&
      convertedJSONtoXML === in_XML
    ) {
      logSteps.push(
        "Success: in_YAML equals in_JSON equals in_XML, all are valid and compliant with input XSD"
      )
    } else {
      logSteps.push("Error: YAML, JSON, and XML are not equal")
    }
  }

  // Step 7: Apply XSLT Transformation
  let xsltResult
  try {
    if (isValidXML && isCompliantWithInputXSD) {
      xsltResult = await transformXMLUsingXSLT(in_XML, in_XSLT)

      logSteps.push("Successfully applied XSLT transformation")
    }
  } catch (error) {
    logSteps.push("Error applying XSLT transformation: " + error.message)
  }

  // // Step 8: Validate the transformed result
  // try {
  //   if (xsltResult) {
  //     console.log("12337836375373", xsltResult)
  //     const isValidResult = await validateXML(xsltResult)
  //     logSteps.push(
  //       isValidResult
  //         ? "Transformed result is valid XML"
  //         : "Transformed result is invalid XML"
  //     )
  //   }
  // } catch (error) {
  //   logSteps.push("Error validating transformed result: " + error.message)
  // }

  // Step 9: Validate the transformed result against output XSD
  try {
    if (xsltResult) {
      const isCompliantWithOutputXSD = await validateXSD(
        xsltResult,
        out_XSD,
        logSteps
      )
      logSteps.push(
        isCompliantWithOutputXSD
          ? "Transformed result is compliant with output XSD"
          : "Transformed result is not compliant with output XSD"
      )
    }
  } catch (error) {
    logSteps.push(
      "Error validating transformed result against output XSD: " + error.message
    )
  }

  if (verbose) {
    return {
      logSteps,
      out_YAML: in_YAML, // Final YAML input
      out_JSON: in_JSON, // Final JSON input
      out_XML: xsltResult, // Final XML input
    }
  }

  // Return logs
  return {
    success: true,
    logSteps,
  } // Return only logSteps in non-verbose mode
}

function normalizeYAML(inputData) {
  // Split the data by 'to:', 'from:', etc., and ensure proper line breaks and indentation
  let normalizedData = inputData.replace(/([a-zA-Z]+:)/g, "\n$1")

  // Optionally, trim any extra spaces or lines
  normalizedData = normalizedData.trim()

  return normalizedData
}
function normalizeXML(xmlString) {
  try {
    // Remove extra spaces within the tags or trim content if necessary
    xmlString = xmlString.replace(/\s+</g, "<").replace(/>\s+/g, ">")

    // Convert XML to JSON synchronously
    const jsonObject = xml2json.toJson(xmlString, {
      object: true,
      reversible: true,
    })

    // Convert JSON back to XML, ensuring proper formatting
    const normalizedXML = xml2json.toXml(jsonObject, {
      pretty: true,
      indent: "  ",
      newlines: true,
    })
    return normalizedXML
  } catch (error) {
    throw new Error("Error normalizing XML: " + error.message)
  }
}

function combineYAMLs(yaml1, yaml2, logSteps) {
  try {
    // Parse the YAML strings into JavaScript objects
    const obj1 = yaml.load(yaml1)
    const obj2 = yaml.load(yaml2)

    // Combine the objects (obj2 overwrites obj1 in case of conflicts)
    const mergedObject = { ...obj1, ...obj2 }

    // Convert the merged object back to a YAML string
    const mergedYAML = yaml.dump(mergedObject)

    return mergedYAML
  } catch (error) {
    throw new Error(`Error combining YAMLs: ${error.message}`)
  }
}

function combineXMLStrings(yamlXML, jsonXML, rootElement = "combined") {
  return `<${rootElement}>
    <fromYAML><![CDATA[${yamlXML}]]></fromYAML>
    <fromJSON><![CDATA[${jsonXML}]]></fromJSON>
  </${rootElement}>`
}


function combineYAMLAndJSONtoXML(yamlString, jsonString, logSteps) {
  try {
    // Convert YAML to XML
    const yamlXML = YAMLtoXML(yamlString);
    logSteps.push("Successfully converted YAML to XML.");

    // Convert JSON to XML
    const jsonXML = JSONtoXML(JSON.parse(jsonString));
    logSteps.push("Successfully converted JSON to XML.");
    // Combine the two XML outputs
    const combinedXML = combineXMLStrings(yamlXML, jsonXML);
    logSteps.push("Successfully combined YAML and JSON XML outputs.");

    return combinedXML;
  } catch (e) {
    logSteps.push(`Error combining YAML and JSON into XML: ${e.message}`);
    return null;
  }
}

async function validateCase13(plus_YAML, aggregate_XSLT, in_YAML, out_XML  ) {
  const logSteps = []

  try {
    in_YAML = normalizeYAML(in_YAML) // Normalize the YAML input to ensure proper formatting
  } catch (error) {
    logSteps.push("Error normalizing YAML: " + error.message)
  }
  let result = await validateYAML(in_YAML, logSteps)
  let isValidYAML = result.success
  logSteps.push(isValidYAML ? "YAML is valid" : "YAML is invalid")

  try {
    plus_YAML = normalizeYAML(plus_YAML) // Normalize the YAML input to ensure proper formatting
  } catch (error) {
    logSteps.push("Error normalizing YAML: " + error.message)
  }
   result = await validateYAML(plus_YAML, logSteps)
   isValidYAML = result.success
  logSteps.push(isValidYAML ? "YAML plus is valid" : "YAML plus is invalid")

  try {
    let isCombined = combineYAMLs(in_YAML, plus_YAML)
    logSteps.push(isCombined ? "YAMLs combined successfully" : "YAMLs failed to combine" )
  } catch(error){
    logSteps.push("Error combining YAML: " + error.message)
  }

  const mergedXML = YAMLtoXML(JSON.stringify(isCombined))
  logSteps.push("Converted merged YAML to intermediate XML.")

  result = validateXSLT(aggregate_XSLT, logSteps)
  isValidXSLT = result.success
  logSteps.push(
    isValidXSLT
      ? "Aggregate_XSLT is valid."
      : "Error: Aggregate_XSLT is invalid."
  )

  result = await validateXML(out_XML, logSteps)
  let isValidXML = result.success
  logSteps.push(isValidXML ? "out_XML is valid" : "out_XML is invalid")

  const aggregateXML = transformXMLUsingXSLT(mergedXML, aggregate_XSLT)
  logSteps.push("Applied Aggregate_XSLT to generate Aggregate_XML.")

  result = validateXML(aggregateXML, logSteps)
  const isValidAggregateXML = result.success
  logSteps.push(
    isValidAggregateXML
      ? "Aggregate_XML is valid."
      : "Error: Aggregate_XML is invalid."
  )
    return {
      logSteps,
      aggregate_XML: aggregateXML
    }
}

async function case14Handler(plus_YAML, aggregate_XSLT, in_JSON, out_XML, logSteps) {
  // Validate plus_YAML
  try {
    in_YAML = normalizeYAML(in_YAML) // Normalize the YAML input to ensure proper formatting
  } catch (error) {
    logSteps.push("Error normalizing YAML: " + error.message)
  }
  let result = await validateYAML(in_YAML, logSteps)
  let isValidYAML = result.success
  logSteps.push(isValidYAML ? "YAML is valid" : "YAML is invalid")

  // Validate in_JSON
  result = await validateJSON(in_JSON, logSteps)
  let isValidJSON = result.success
  logSteps.push(isValidJSON ? "JSON is valid" : "JSON is invalid")

  try {
    in_JSON = JSON.parse(in_JSON)
    logSteps.push("Success: in_JSON successfully parsed into an object")
  } catch (parseError) {
    logSteps.push("Error: Failed to parse in_JSON into an object")
    return logSteps // Exit early if JSON is invalid
  }

  // Validate aggregate_XSLT (as XML)
  result = validateXSLT(aggregate_XSLT, logSteps)
  isValidXSLT = result.success
  logSteps.push(
    isValidXSLT
      ? "Aggregate_XSLT is valid."
      : "Error: Aggregate_XSLT is invalid."
  )

  result = validateXML(out_XML, logSteps)
  const isOutXMLValid = result.success
  logSteps.push(
    isOutXMLValid ? "out_XML is valid." : "Error: out_XML is invalid."
  )

  if (!isValidYAML || !isValidJSON || !isValidXSLT) {
    logSteps.push("Validation failed for one or more inputs.")
    return { logSteps, aggregate_XML: null }
  }

  // Combine YAML and JSON into intermediate XML
  const intermediateXML = combineYAMLAndJSONtoXML(plus_YAML, in_JSON, logSteps)

  if (!intermediateXML) {
    logSteps.push("Failed to create intermediate XML from YAML and JSON.")
    return { logSteps, aggregate_XML: null }
  }

  // Validate and transform the intermediate XML using aggregate_XSLT
  const aggregate_XML = validateXMLAgainstXSLT(
    intermediateXML,
    aggregate_XSLT,
    logSteps
  )

  if (!aggregate_XML) {
    logSteps.push("Failed to transform intermediate XML using aggregate_XSLT.")
    return { logSteps, aggregate_XML: null }
  }

  // Return the aggregate XML
  return {
    logSteps,
    aggregate_XML: aggregate_XML
  }
}

async function handleCase15(plus_YAML, aggregate_XSLT, in_XML, out_XML, logSteps) {
  let aggregate_XML

  try {
    try {
      plus_YAML = normalizeYAML(plus_YAML) // Normalize the YAML input to ensure proper formatting
    } catch (error) {
      logSteps.push("Error normalizing YAML: " + error.message)
    }
    logSteps.push("Validating plus_YAML...")
    let result = await validateYAML(in_YAML, logSteps)
    let isValidYAML = result.success
    logSteps.push(isValidYAML ? "YAML is valid" : "YAML is invalid")

    logSteps.push("Validating in_XML...")
    result = await validateXML(in_XML, logSteps)
    const isXMLValid = result.success
    logSteps.push(
      `in_XML validation result: ${
        isXMLValid ? "Success: XML is valid" : "Error: XML is invalid"
      }`
    )

    logSteps.push("Validating aggregate_XSLT...")
    const isXSLTValid = await validateXSLT(aggregate_XSLT, logSteps)
    logSteps.push(
      `aggregate_XSLT validation result: ${
        isXSLTValid ? "Success: XSLT is valid" : "Error: XSLT is invalid"
      }`
    )

    result = validateXML(out_XML, logSteps)
    const isOutXMLValid = result.success
    logSteps.push(
      isOutXMLValid ? "out_XML is valid." : "Error: out_XML is invalid."
    )

    if (!isYAMLValid || !isXMLValid || !isXSLTValid) {
      logSteps.push("Validation failed: One or more inputs are invalid.")
      throw new Error("Validation failed for inputs.")
    }

    // Step 2: Transform Inputs
    logSteps.push("Converting plus_YAML to XML...")
    const plus_XML = YAMLtoXML(plus_YAML)
    logSteps.push("Successfully converted plus_YAML to XML.")

    logSteps.push("Combining transformed XMLs into aggregate_XML...")
    aggregate_XML = combineXMLStrings(plus_XML, in_XML, "aggregate")
    logSteps.push("Successfully combined transformed XMLs into aggregate_XML.")

    logSteps.push("Applying aggregate_XSLT transformation to in_XML...")
      aggregate_XML = await transformXMLUsingXSLT(
      aggregate_XML,
      aggregate_XSLT
    )
    logSteps.push("Successfully applied aggregate_XSLT to in_XML.")

    // Step 4: Return Output
    return {
      logSteps,
      aggregate_XML: aggregate_XML,
    }
  } catch (error) {
    logSteps.push(`Error in processing case 15: ${error.message}`)
    return {
      logSteps,
      out_XML: null,
    }
  }
}

async function validateFiles(
  plus_YAML,
  aggregate_XSLT,
  in_XML,
  in_XSD,
  out_XML,
  logSteps
) {
  try {
    let aggregate_XML
    plus_YAML = normalizeYAML(plus_YAML) // Normalize the YAML input to ensure proper formatting
    let result = await validateYAML(plus_YAML, logSteps)
    let isValidYAML = result.success
    logSteps.push(isValidYAML ? "YAML is valid" : "YAML is invalid")

    logSteps.push("Validating in_XML...")
    result = await validateXML(in_XML, logSteps)
    const isXMLValid = result.success
    logSteps.push(
      `in_XML validation result: ${
        isXMLValid ? "Success: XML is valid" : "Error: XML is invalid"
      }`
    )

    logSteps.push("Validating aggregate_XSLT...")
    const isXSLTValid = await validateXSLT(aggregate_XSLT, logSteps)
    logSteps.push(
      `aggregate_XSLT validation result: ${
        isXSLTValid ? "Success: XSLT is valid" : "Error: XSLT is invalid"
      }`
    )

    const isCompliantWithInputXSD = await validateXSD(in_XML, in_XSD, logSteps)
    logSteps.push(
      isCompliantWithInputXSD
        ? "XML is compliant with input XSD"
        : "XML is not compliant with input XSD"
    )

    result = validateXML(out_XML, logSteps)
    const isOutXMLValid = result.success
    logSteps.push(
      isOutXMLValid ? "out_XML is valid." : "Error: out_XML is invalid."
    )

    logSteps.push("Converting plus_YAML to XML...")
    const plus_XML = YAMLtoXML(plus_YAML)
    logSteps.push("Successfully converted plus_YAML to XML.")

    logSteps.push("Combining transformed XMLs into aggregate_XML...")
    aggregate_XML = combineXMLStrings(plus_XML, in_XML, "aggregate")
    logSteps.push("Successfully combined transformed XMLs into aggregate_XML.")

    logSteps.push("Applying aggregate_XSLT transformation to in_XML...")
    const transformed_XML = await transformXMLUsingXSLT(
      aggregate_XML,
      aggregate_XSLT
    )
    logSteps.push("Successfully applied aggregate_XSLT to in_XML.")

    return {
      success: true,
      logSteps,
      aggregate_XML: transformed_XML, // Assuming you want to create an aggregated XML from in_XML and out_XML
    }
  } catch (e) {
    logSteps.push(`Validation failed: ${e.message}`)
    return {
      success: false,
      logSteps,
    }
  }
}

async function validate17(plus_YAML, plus_XSD, aggregate_XSLT, in_XML, in_XSD, out_XML) {
  try {
    plus_YAML = normalizeYAML(plus_YAML) // Normalize the YAML input to ensure proper formatting
    let result = await validateYAML(plus_YAML, logSteps)
    let isValidYAML = result.success
    logSteps.push(isValidYAML ? "YAML is valid" : "YAML is invalid")

    logSteps.push("Validating in_XML...")
    result = await validateXML(in_XML, logSteps)
    const isXMLValid = result.success
    logSteps.push(
      `in_XML validation result: ${
        isXMLValid ? "Success: XML is valid" : "Error: XML is invalid"
      }`
    )

    logSteps.push("Converting plus_YAML to XML...")
    const plus_XML = YAMLtoXML(plus_YAML)
    logSteps.push("Successfully converted plus_YAML to XML.")

    logSteps.push("Validating aggregate_XSLT...")
    const isXSLTValid = await validateXSLT(aggregate_XSLT, logSteps)
    logSteps.push(
      `aggregate_XSLT validation result: ${
        isXSLTValid ? "Success: XSLT is valid" : "Error: XSLT is invalid"
      }`
    )

    const isCompliantWithInputXSD = await validateXSD(in_XML, in_XSD, logSteps)
    logSteps.push(
      isCompliantWithInputXSD
        ? "XML is compliant with input XSD"
        : "XML is not compliant with input XSD"
    )

    const isCompliantWithPlusXSD = await validateXSD(
      plus_XML,
      plus_XSD,
      logSteps
    )
    logSteps.push(
      isCompliantWithPlusXSD
        ? "plus_XML is compliant with plus XSD"
        : "plus_XML is not compliant with plus XSD"
    )

    logSteps.push("Combining transformed XMLs into aggregate_XML...")
    let aggregate_XML = combineXMLStrings(plus_XML, in_XML, "aggregate")
    logSteps.push("Successfully combined transformed XMLs into aggregate_XML.")

    logSteps.push("Applying aggregate_XSLT transformation to in_XML...")
    const transformed_XML = await transformXMLUsingXSLT(
      aggregate_XML,
      aggregate_XSLT
    )
    logSteps.push("Successfully applied aggregate_XSLT to in_XML.")

    return {
      success: true,
      logSteps,
      aggregate_XML: transformed_XML, // Assuming you want to create an aggregated XML from in_XML and out_XML
    }
  } catch (e) {
    logSteps.push(`Validation failed: ${e.message}`)
    return {
      success: false,
      logSteps,
    }
  }
}

async function handleCasePlusYAMLAggregateXSLTInYAML(
  plus_YAML,
  aggregate_XSLT,
  in_YAML,
  logSteps
) {

  try {
    logSteps.push("Starting validation and processing for case.")

    // Step 1: Validate plus_YAML
    plus_YAML = normalizeYAML(plus_YAML) // Normalize the YAML input to ensure proper formatting
    let result = await validateYAML(plus_YAML, logSteps)
    let isValidYAML = result.success
    logSteps.push(isValidYAML ? "plus_YAML is valid" : "plus_YAML is invalid")

    // Step 2: Validate in_YAML
    plus_YAML = normalizeYAML(in_YAML) // Normalize the YAML input to ensure proper formatting
    result = await validateYAML(in_YAML, logSteps)
    isValidYAML = result.success
    logSteps.push(isValidYAML ? "YAML is valid" : "YAML is invalid")

    // Step 3: Generate XML from plus_YAML
    let plus_XML = YAMLtoXML(plus_YAML)
    logSteps.push("Generated plus_XML from plus_YAML.")

    // Step 4: Convert in_YAML to XML
    let in_XML = YAMLtoXML(in_YAML)
    logSteps.push("Generated in_XML from in_YAML.")

    logSteps.push("Combining transformed XMLs into aggregate_XML...")
    combinedXML = combineXMLStrings(in_XML, plus_XML, "aggregate")
    logSteps.push("Successfully combined transformed XMLs into aggregate_XML.")

    // Step 5: Combine XMLs using aggregate_XSLT
    const aggregate_XML = await transformXMLUsingXSLT(
      combinedXML,
      aggregate_XSLT
    )
    logSteps.push(
      "Transformed XML using aggregate_XSLT to produce aggregate_XML."
    )

    // Step 6: Validate XMLs (compliance check)
    const isPlusXMLCompliant = await validateXML(plus_XML, logSteps)
    logSteps.push(
      isPlusXMLCompliant
        ? "plus_XML is valid and compliant."
        : "plus_XML is not valid or compliant."
    )

    const isInXMLCompliant = await validateXML(in_XML, logSteps)
    logSteps.push(
      isInXMLCompliant
        ? "in_XML is valid and compliant."
        : "in_XML is not valid or compliant."
    )

    const isAggregateXMLCompliant = await validateXML(aggregate_XML, logSteps)
    logSteps.push(
      isAggregateXMLCompliant
        ? "aggregate_XML is valid and compliant."
        : "aggregate_XML is not valid or compliant."
    )

    // Step 7: Output aggregate_XML
    out_XML = aggregate_XML
    logSteps.push("aggregate_XML is set as out_XML.")

    // Step 8: Convert out_XML to YAML (out_YAML)
    out_YAML = await XMLtoYAML(out_XML)
    logSteps.push("Converted out_XML to out_YAML.")

    // Step 9: Convert out_XML to JSON (out_JSON)
    out_JSON = await XMLtoJSON(out_XML)
    logSteps.push("Converted out_XML to out_JSON.")

    plus_JSON = YAMLtoJSON(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_JSON.")

    in_JSON = YAMLtoJSON(in_YAML)
    logSteps.push("Converted in_YAML to in_JSON")


    // Step 10: Generate XSDs (Commented out as requested)
    /*
    out_XSD = generateXSD(out_XML, logSteps);
    logSteps.push("Generated out_XSD from out_XML.");
    */

    // Logging verbose outputs
    // if (verbose) {
    //   logSteps.push(`plus_XML: ${plus_XML}`)
    //   logSteps.push(`in_XML: ${in_XML}`)
    //   logSteps.push(`aggregate_XML: ${aggregate_XML}`)
    //   logSteps.push(`out_YAML: ${out_YAML}`)
    //   logSteps.push(`out_JSON: ${JSON.stringify(out_JSON, null, 2)}`)
    //   // logSteps.push(`out_XSD: ${out_XSD}`);
    // }

    logSteps.push("Processing for case completed successfully.")
    return {
      plus_JSON: plus_JSON,
      plus_XML: plus_XML,
      // plus_XSD: plus_XSD,
      in_JSON: in_JSON,
      in_XML: in_XML,
      // in_XSD: in_XSD,
      aggregate_XML: aggregate_XML,
      // aggregate_XSD: aggregate_XSD,
      // XSLT: XSLT,
      out_YAML: out_YAML,
      out_JSON: out_JSON,
      out_XML: out_XML,
      // out_XSD: out_XSD,
      logSteps
    }
  } catch (error) {
    logSteps.push(`Error occurred: ${error.message}`)
    throw error
  }
}

async function handleCasePlusYAMLAggregateXSLTInJSON(
  plus_YAML,
  aggregate_XSLT,
  in_JSON,
  logSteps
) {

  let plus_JSON, plus_XML, plus_XSD, in_YAML, in_XML, in_XSD
  let aggregate_XML, aggregate_XSD, out_YAML, out_JSON, out_XML, out_XSD
  const verbose = true // Verbose is set to true

  try {
    logSteps.push("Starting validation and processing for case.")

    // Step 1: Validate plus_YAML
    plus_YAML = normalizeYAML(plus_YAML) // Normalize the YAML input to ensure proper formatting
    let result = await validateYAML(plus_YAML, logSteps)
    let isValidYAML = result.success
    logSteps.push(isValidYAML ? "plus_YAML is valid" : "plus_YAML is invalid")

    // Step 2: Validate in_JSON
    result = await validateJSON(in_JSON, logSteps)
    let isValidJSON = result.success
    logSteps.push(isValidJSON ? "JSON is valid" : "JSON is invalid")

    try {
      in_JSON = JSON.parse(in_JSON)
      logSteps.push("Success: in_JSON successfully parsed into an object")
    } catch (parseError) {
      logSteps.push("Error: Failed to parse in_JSON into an object")
      return logSteps // Exit early if JSON is invalid
    }

    // Step 3: Generate plus_JSON and Validate
    plus_JSON = YAMLtoJSON(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_JSON.")
    result = await validateJSON(plus_JSON, logSteps, verbose)
    const isValidPlusJSON = result.success
    logSteps.push(
      isValidPlusJSON
        ? "plus_JSON validation succeeded."
        : "plus_JSON validation failed."
    )

    // Step 4: Convert plus_YAML to XML
    plus_XML = YAMLtoXML(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_XML.")

    // Step 5: Convert in_JSON to YAML and XML
    in_YAML = JSONtoYAML(in_JSON)
    logSteps.push("Converted in_JSON to in_YAML.")
    in_XML = JSONtoXML(in_JSON)
    logSteps.push("Converted in_JSON to in_XML.")

    combinedXML = combineXMLStrings(in_XML, plus_XML, "aggregate")
    logSteps.push("Successfully combined transformed XMLs into aggregate_XML.")


    // Step 6: Combine XMLs using aggregate_XSLT
    aggregate_XML = await transformXMLUsingXSLT(combinedXML, aggregate_XSLT)
    logSteps.push(
      "Transformed XML using aggregate_XSLT to produce aggregate_XML."
    )

    // Step 7: Compliance Checks for XMLs
    result = await validateXML(plus_XML, logSteps)
    const isPlusXMLCompliant = result.success
    logSteps.push(
      isPlusXMLCompliant
        ? "plus_XML is valid and compliant."
        : "plus_XML is not valid or compliant."
    )

    result = await validateXML(in_XML, logSteps)
    const isInXMLCompliant = result.success
    logSteps.push(
      isInXMLCompliant
        ? "in_XML is valid and compliant."
        : "in_XML is not valid or compliant."
    )

    result = await validateXML(aggregate_XML, logSteps)
    const isAggregateXMLCompliant = result.success
    logSteps.push(
      isAggregateXMLCompliant
        ? "aggregate_XML is valid and compliant."
        : "aggregate_XML is not valid or compliant."
    )

    // Step 8: Generate Outputs
    out_XML = aggregate_XML
    logSteps.push("Set aggregate_XML as out_XML.")

    // Convert aggregate_XML to aggregate_XSD (Commented out as requested)
    /*
    aggregate_XSD = generateXSD(aggregate_XML, logSteps);
    logSteps.push("Generated aggregate_XSD from aggregate_XML.");
    */

    // Convert in_XML to in_XSD (Commented out as requested)
    /*
    in_XSD = generateXSD(in_XML, logSteps);
    logSteps.push("Generated in_XSD from in_XML.");
    */

    // Convert plus_XML to plus_XSD (Commented out as requested)
    /*
    plus_XSD = generateXSD(plus_XML, logSteps);
    logSteps.push("Generated plus_XSD from plus_XML.");
    */

    // Convert out_XML to YAML and JSON
    out_YAML = await XMLtoYAML(out_XML)
    logSteps.push("Converted out_XML to out_YAML.")
    out_JSON = await XMLtoJSON(out_XML)
    logSteps.push("Converted out_XML to out_JSON.")

    // Step 9: Logging Verbose Outputs

    logSteps.push("Processing for case completed successfully.")
    return {
      plus_JSON: plus_JSON,
      plus_XML: plus_XML,
      // plus_XSD: plus_XSD,
      in_YAML: in_YAML,
      in_XML: in_XML,
      // in_XSD: in_XSD,
      aggregate_XML: aggregate_XML,
      // aggregate_XSD: aggregate_XSD,
      // XSLT: XSLT,
      out_YAML: out_YAML,
      out_JSON: out_JSON,
      out_XML: out_XML,
      // out_XSD: out_XSD,
      logSteps,
    }
  } catch (error) {
    logSteps.push(`Error occurred: ${error.message}`)
    throw error
  }
}


async function handleCasePlusYAMLAggregateXSLTInXML(
  plus_YAML,
  aggregate_XSLT,
  in_XML,
  logSteps
) {
  let plus_JSON, plus_XML, plus_XSD, in_YAML, in_JSON, in_XSD
  let aggregate_XML, aggregate_XSD, out_YAML, out_JSON, out_XML, out_XSD
  const verbose = true // Verbose is set to true

  try {
    logSteps.push("Starting validation and processing for case.")

    // Step 1: Validate plus_YAML
    plus_YAML = normalizeYAML(plus_YAML) // Normalize the YAML input to ensure proper formatting
    let result = await validateYAML(plus_YAML, logSteps)
    let isValidYAML = result.success
    logSteps.push(isValidYAML ? "plus_YAML is valid" : "plus_YAML is invalid")

    // Step 3: Generate plus_JSON and Validate
    plus_JSON = YAMLtoJSON(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_JSON.")
    const isValidPlusJSON = await validateJSON(plus_JSON, logSteps, verbose)
    logSteps.push(
      isValidPlusJSON
        ? "plus_JSON validation succeeded."
        : "plus_JSON validation failed."
    )

    result = await validateXML(in_XML, logSteps)
    const isXMLCompliant = result.success
    logSteps.push(
      isXMLCompliant
        ? "XML is valid and compliant."
        : "XML is not valid or compliant."
    )

    // Step 4: Convert plus_YAML to XML
    plus_XML = YAMLtoXML(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_XML.")

    // Step 5: Convert in_JSON to YAML and XML
    in_YAML = XMLtoYAML(in_XML)
    logSteps.push("Converted in_JSON to in_YAML.")
    // in_XML = JSONtoXML(in_JSON)
    // logSteps.push("Converted in_JSON to in_XML.")
    combinedXML = combineXMLStrings(in_XML, plus_XML, "aggregate")
    logSteps.push("Successfully combined transformed XMLs into aggregate_XML.")

    // Step 6: Combine XMLs using aggregate_XSLT
    aggregate_XML = await transformXMLUsingXSLT(combinedXML, aggregate_XSLT)
    logSteps.push(
      "Transformed XML using aggregate_XSLT to produce aggregate_XML."
    )

    // Step 7: Compliance Checks for XMLs
    result = await validateXML(plus_XML, logSteps)
    const isPlusXMLCompliant = result.success
    logSteps.push(
      isPlusXMLCompliant
        ? "plus_XML is valid and compliant."
        : "plus_XML is not valid or compliant."
    )

    result = await validateXML(in_XML, logSteps)
    const isInXMLCompliant = result.success
    logSteps.push(
      isInXMLCompliant
        ? "in_XML is valid and compliant."
        : "in_XML is not valid or compliant."
    )

    result = await validateXML(aggregate_XML, logSteps)
    const isAggregateXMLCompliant = result.success
    logSteps.push(
      isAggregateXMLCompliant
        ? "aggregate_XML is valid and compliant."
        : "aggregate_XML is not valid or compliant."
    )

    // Step 8: Generate Outputs
    out_XML = aggregate_XML
    logSteps.push("Set aggregate_XML as out_XML.")

    // Convert aggregate_XML to aggregate_XSD (Commented out as requested)
    /*
    aggregate_XSD = generateXSD(aggregate_XML, logSteps);
    logSteps.push("Generated aggregate_XSD from aggregate_XML.");
    */

    // Convert in_XML to in_XSD (Commented out as requested)
    /*
    in_XSD = generateXSD(in_XML, logSteps);
    logSteps.push("Generated in_XSD from in_XML.");
    */

    // Convert plus_XML to plus_XSD (Commented out as requested)
    /*
    plus_XSD = generateXSD(plus_XML, logSteps);
    logSteps.push("Generated plus_XSD from plus_XML.");
    */

    // Convert out_XML to YAML and JSON
    out_YAML = await XMLtoYAML(out_XML)
    logSteps.push("Converted out_XML to out_YAML.")
    out_JSON = await XMLtoJSON(out_XML)
    logSteps.push("Converted out_XML to out_JSON.")
    in_JSON = YAMLtoJSON(in_YAML)
    logSteps.push("Converted in_YAML to in_JSON")

    // Step 9: Logging Verbose Outputs

    logSteps.push("Processing for case completed successfully.")
    return {
      plus_JSON: plus_JSON,
      plus_XML: plus_XML,
      // plus_XSD: plus_XSD,
      in_YAML: in_YAML,
      in_JSOM: in_JSON,
      // in_XSD: in_XSD,
      aggregate_XML: aggregate_XML,
      // aggregate_XSD: aggregate_XSD,
      // XSLT: XSLT,
      out_YAML: out_YAML,
      out_JSON: out_JSON,
      out_XML: out_XML,
      // out_XSD: out_XSD,
      logSteps,
    }
  } catch (error) {
    logSteps.push(`Error occurred: ${error.message}`)
    throw error
  }
}

async function handleCasePlusYAMLAggregateXSLTInXML(
  plus_YAML,
  aggregate_XSLT,
  in_XML,
  in_XSD,
  logSteps
) {
  let plus_JSON, plus_XML, plus_XSD, in_YAML, in_JSON, in_XSD
  let aggregate_XML, aggregate_XSD, out_YAML, out_JSON, out_XML, out_XSD
  const verbose = true // Verbose is set to true

  try {
    logSteps.push("Starting validation and processing for case.")

    // Step 1: Validate plus_YAML
    const isValidPlusYAML = await validateYAML(plus_YAML, logSteps, verbose)
    logSteps.push(
      isValidPlusYAML
        ? "plus_YAML validation succeeded."
        : "plus_YAML validation failed."
    )

    // Step 2: Validate in_JSON
    // const isValidInJSON = await validateJSON(in_JSON, logSteps, verbose)
    // logSteps.push(
    //   isValidInJSON
    //     ? "in_JSON validation succeeded."
    //     : "in_JSON validation failed."
    // )

    // Step 3: Generate plus_JSON and Validate
    plus_JSON = YAMLtoJSON(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_JSON.")
    const isValidPlusJSON = await validateJSON(plus_JSON, logSteps, verbose)
    logSteps.push(
      isValidPlusJSON
        ? "plus_JSON validation succeeded."
        : "plus_JSON validation failed."
    )

    // Step 4: Convert plus_YAML to XML
    plus_XML = YAMLtoXML(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_XML.")

    // Step 5: Convert in_JSON to YAML and XML
    in_YAML = XMLtoYAML(in_XML)
    logSteps.push("Converted in_JSON to in_YAML.")
    // in_XML = JSONtoXML(in_JSON)
    // logSteps.push("Converted in_JSON to in_XML.")
    combinedXML = combineXMLStrings(in_XML, plus_XML, "aggregate")
    logSteps.push("Successfully combined transformed XMLs into aggregate_XML.")

    // Step 6: Combine XMLs using aggregate_XSLT
    aggregate_XML = await transformXMLUsingXSLT(combinedXML, aggregate_XSLT)
    logSteps.push(
      "Transformed XML using aggregate_XSLT to produce aggregate_XML."
    )

    // Step 7: Compliance Checks for XMLs
    const isPlusXMLCompliant = await validateXML(plus_XML, logSteps)
    logSteps.push(
      isPlusXMLCompliant
        ? "plus_XML is valid and compliant."
        : "plus_XML is not valid or compliant."
    )

    const isInXMLCompliant = await validateXML(in_XML, logSteps)
    logSteps.push(
      isInXMLCompliant
        ? "in_XML is valid and compliant."
        : "in_XML is not valid or compliant."
    )

    const isCompliantWithInputXSD = await validateXSD(in_XML, in_XSD, logSteps)
    logSteps.push(
      isCompliantWithInputXSD
        ? "XML is compliant with input XSD"
        : "XML is not compliant with input XSD"
    )

    const isAggregateXMLCompliant = await validateXML(aggregate_XML, logSteps)
    logSteps.push(
      isAggregateXMLCompliant
        ? "aggregate_XML is valid and compliant."
        : "aggregate_XML is not valid or compliant."
    )

    // Step 8: Generate Outputs
    out_XML = aggregate_XML
    logSteps.push("Set aggregate_XML as out_XML.")

    // Convert aggregate_XML to aggregate_XSD (Commented out as requested)
    /*
    aggregate_XSD = generateXSD(aggregate_XML, logSteps);
    logSteps.push("Generated aggregate_XSD from aggregate_XML.");
    */

    // Convert in_XML to in_XSD (Commented out as requested)
    /*
    in_XSD = generateXSD(in_XML, logSteps);
    logSteps.push("Generated in_XSD from in_XML.");
    */

    // Convert plus_XML to plus_XSD (Commented out as requested)
    /*
    plus_XSD = generateXSD(plus_XML, logSteps);
    logSteps.push("Generated plus_XSD from plus_XML.");
    */

    // Convert out_XML to YAML and JSON
    out_YAML = await XMLtoYAML(out_XML)
    logSteps.push("Converted out_XML to out_YAML.")
    out_JSON = await XMLtoJSON(out_XML)
    logSteps.push("Converted out_XML to out_JSON.")
    in_JSON = YAMLtoJSON(in_YAML)
    logSteps.push("Converted in_YAML to in_JSON")

    // Step 9: Logging Verbose Outputs

    logSteps.push("Processing for case completed successfully.")
    return {
      plus_JSON: plus_JSON,
      plus_XML: plus_XML,
      // plus_XSD: plus_XSD,
      in_YAML: in_YAML,
      in_JSOM: in_JSON,
      // in_XSD: in_XSD,
      aggregate_XML: aggregate_XML,
      // aggregate_XSD: aggregate_XSD,
      // XSLT: XSLT,
      out_YAML: out_YAML,
      out_JSON: out_JSON,
      out_XML: out_XML,
      // out_XSD: out_XSD,
      logSteps,
    }
  } catch (error) {
    logSteps.push(`Error occurred: ${error.message}`)
    throw error
  }
}


async function handleCasePlusYAMLAggregateXSLTInXML(
  plus_YAML,
  plus_XSD,
  aggregate_XSLT,
  in_XML,
  in_XSD,
  logSteps
) {
  let plus_JSON, plus_XML, plus_XSD, in_YAML, in_JSON, in_XSD
  let aggregate_XML, aggregate_XSD, out_YAML, out_JSON, out_XML, out_XSD
  const verbose = true // Verbose is set to true

  try {
    logSteps.push("Starting validation and processing for case.")

    // Step 1: Validate plus_YAML
    const isValidPlusYAML = await validateYAML(plus_YAML, logSteps, verbose)
    logSteps.push(
      isValidPlusYAML
        ? "plus_YAML validation succeeded."
        : "plus_YAML validation failed."
    )

    // Step 2: Validate in_JSON
    // const isValidInJSON = await validateJSON(in_JSON, logSteps, verbose)
    // logSteps.push(
    //   isValidInJSON
    //     ? "in_JSON validation succeeded."
    //     : "in_JSON validation failed."
    // )

    // Step 3: Generate plus_JSON and Validate
    plus_JSON = YAMLtoJSON(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_JSON.")
    const isValidPlusJSON = await validateJSON(plus_JSON, logSteps, verbose)
    logSteps.push(
      isValidPlusJSON
        ? "plus_JSON validation succeeded."
        : "plus_JSON validation failed."
    )

    // Step 4: Convert plus_YAML to XML
    plus_XML = YAMLtoXML(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_XML.")

    // Step 5: Convert in_JSON to YAML and XML
    in_YAML = XMLtoYAML(in_XML)
    logSteps.push("Converted in_JSON to in_YAML.")
    // in_XML = JSONtoXML(in_JSON)
    // logSteps.push("Converted in_JSON to in_XML.")
    combinedXML = combineXMLStrings(in_XML, plus_XML, "aggregate")
    logSteps.push("Successfully combined transformed XMLs into aggregate_XML.")

    // Step 6: Combine XMLs using aggregate_XSLT
    aggregate_XML = await transformXMLUsingXSLT(combinedXML, aggregate_XSLT)
    logSteps.push(
      "Transformed XML using aggregate_XSLT to produce aggregate_XML."
    )

    // Step 7: Compliance Checks for XMLs
    const isPlusXMLCompliant = await validateXML(plus_XML, logSteps)
    logSteps.push(
      isPlusXMLCompliant
        ? "plus_XML is valid and compliant."
        : "plus_XML is not valid or compliant."
    )

    const isInXMLCompliant = await validateXML(in_XML, logSteps)
    logSteps.push(
      isInXMLCompliant
        ? "in_XML is valid and compliant."
        : "in_XML is not valid or compliant."
    )

    const isCompliantWithInputXSD = await validateXSD(in_XML, in_XSD, logSteps)
    logSteps.push(
      isCompliantWithInputXSD
        ? "XML is compliant with input XSD"
        : "XML is not compliant with input XSD"
    )

    const isCompliantWithPlusXSD = await validateXSD(plus_XML, plus_XSD, logSteps)
    logSteps.push(
      isCompliantWithPlusXSD
        ? "plus_XML is compliant with plus_XSD"
        : "plus_XML is not compliant with plus_XSD"
    )

    const isAggregateXMLCompliant = await validateXML(aggregate_XML, logSteps)
    logSteps.push(
      isAggregateXMLCompliant
        ? "aggregate_XML is valid and compliant."
        : "aggregate_XML is not valid or compliant."
    )

    // Step 8: Generate Outputs
    out_XML = aggregate_XML
    logSteps.push("Set aggregate_XML as out_XML.")

    // Convert aggregate_XML to aggregate_XSD (Commented out as requested)
    /*
    aggregate_XSD = generateXSD(aggregate_XML, logSteps);
    logSteps.push("Generated aggregate_XSD from aggregate_XML.");
    */

    // Convert in_XML to in_XSD (Commented out as requested)
    /*
    in_XSD = generateXSD(in_XML, logSteps);
    logSteps.push("Generated in_XSD from in_XML.");
    */

    // Convert plus_XML to plus_XSD (Commented out as requested)
    /*
    plus_XSD = generateXSD(plus_XML, logSteps);
    logSteps.push("Generated plus_XSD from plus_XML.");
    */

    // Convert out_XML to YAML and JSON
    out_YAML = await XMLtoYAML(out_XML)
    logSteps.push("Converted out_XML to out_YAML.")
    out_JSON = await XMLtoJSON(out_XML)
    logSteps.push("Converted out_XML to out_JSON.")
    in_JSON = YAMLtoJSON(in_YAML)
    logSteps.push("Converted in_YAML to in_JSON")

    // Step 9: Logging Verbose Outputs

    logSteps.push("Processing for case completed successfully.")
    return {
      plus_JSON: plus_JSON,
      plus_XML: plus_XML,
      // plus_XSD: plus_XSD,
      in_YAML: in_YAML,
      in_JSOM: in_JSON,
      // in_XSD: in_XSD,
      aggregate_XML: aggregate_XML,
      // aggregate_XSD: aggregate_XSD,
      // XSLT: XSLT,
      out_YAML: out_YAML,
      out_JSON: out_JSON,
      out_XML: out_XML,
      // out_XSD: out_XSD,
      logSteps,
    }
  } catch (error) {
    logSteps.push(`Error occurred: ${error.message}`)
    throw error
  }
}


async function handleCasePlusYAMLAggregateXSLTInXML(
  plus_YAML,
  plus_XSD,
  aggregate_XSLT,
  in_XML,
  in_XSD,
  logSteps
) {
  let plus_JSON, plus_XML, plus_XSD, in_YAML, in_JSON, in_XSD
  let aggregate_XML, aggregate_XSD, out_YAML, out_JSON, out_XML, out_XSD
  const verbose = true // Verbose is set to true

  try {
    logSteps.push("Starting validation and processing for case.")

    // Step 1: Validate plus_YAML
    const isValidPlusYAML = await validateYAML(plus_YAML, logSteps, verbose)
    logSteps.push(
      isValidPlusYAML
        ? "plus_YAML validation succeeded."
        : "plus_YAML validation failed."
    )

    // Step 2: Validate in_JSON
    // const isValidInJSON = await validateJSON(in_JSON, logSteps, verbose)
    // logSteps.push(
    //   isValidInJSON
    //     ? "in_JSON validation succeeded."
    //     : "in_JSON validation failed."
    // )

    // Step 3: Generate plus_JSON and Validate
    plus_JSON = YAMLtoJSON(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_JSON.")
    const isValidPlusJSON = await validateJSON(plus_JSON, logSteps, verbose)
    logSteps.push(
      isValidPlusJSON
        ? "plus_JSON validation succeeded."
        : "plus_JSON validation failed."
    )

    // Step 4: Convert plus_YAML to XML
    plus_XML = YAMLtoXML(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_XML.")

    // Step 5: Convert in_JSON to YAML and XML
    in_YAML = XMLtoYAML(in_XML)
    logSteps.push("Converted in_JSON to in_YAML.")
    // in_XML = JSONtoXML(in_JSON)
    // logSteps.push("Converted in_JSON to in_XML.")
    combinedXML = combineXMLStrings(in_XML, plus_XML, "aggregate")
    logSteps.push("Successfully combined transformed XMLs into aggregate_XML.")

    // Step 6: Combine XMLs using aggregate_XSLT
    aggregate_XML = await transformXMLUsingXSLT(combinedXML, aggregate_XSLT)
    logSteps.push(
      "Transformed XML using aggregate_XSLT to produce aggregate_XML."
    )

    // Step 7: Compliance Checks for XMLs
    const isPlusXMLCompliant = await validateXML(plus_XML, logSteps)
    logSteps.push(
      isPlusXMLCompliant
        ? "plus_XML is valid and compliant."
        : "plus_XML is not valid or compliant."
    )

    const isInXMLCompliant = await validateXML(in_XML, logSteps)
    logSteps.push(
      isInXMLCompliant
        ? "in_XML is valid and compliant."
        : "in_XML is not valid or compliant."
    )

    const isCompliantWithInputXSD = await validateXSD(in_XML, in_XSD, logSteps)
    logSteps.push(
      isCompliantWithInputXSD
        ? "XML is compliant with input XSD"
        : "XML is not compliant with input XSD"
    )

    const isCompliantWithPlusXSD = await validateXSD(
      plus_XML,
      plus_XSD,
      logSteps
    )
    logSteps.push(
      isCompliantWithPlusXSD
        ? "plus_XML is compliant with plus_XSD"
        : "plus_XML is not compliant with plus_XSD"
    )

    const isAggregateXMLCompliant = await validateXML(aggregate_XML, logSteps)
    logSteps.push(
      isAggregateXMLCompliant
        ? "aggregate_XML is valid and compliant."
        : "aggregate_XML is not valid or compliant."
    )

    // Step 8: Generate Outputs
    out_XML = aggregate_XML
    logSteps.push("Set aggregate_XML as out_XML.")

    // Convert aggregate_XML to aggregate_XSD (Commented out as requested)
    /*
    aggregate_XSD = generateXSD(aggregate_XML, logSteps);
    logSteps.push("Generated aggregate_XSD from aggregate_XML.");
    */

    // Convert in_XML to in_XSD (Commented out as requested)
    /*
    in_XSD = generateXSD(in_XML, logSteps);
    logSteps.push("Generated in_XSD from in_XML.");
    */

    // Convert plus_XML to plus_XSD (Commented out as requested)
    /*
    plus_XSD = generateXSD(plus_XML, logSteps);
    logSteps.push("Generated plus_XSD from plus_XML.");
    */

    // Convert out_XML to YAML and JSON
    out_YAML = await XMLtoYAML(out_XML)
    logSteps.push("Converted out_XML to out_YAML.")
    out_JSON = await XMLtoJSON(out_XML)
    logSteps.push("Converted out_XML to out_JSON.")
    in_JSON = YAMLtoJSON(in_YAML)
    logSteps.push("Converted in_YAML to in_JSON")

    // Step 9: Logging Verbose Outputs

    logSteps.push("Processing for case completed successfully.")
    return {
      plus_JSON: plus_JSON,
      plus_XML: plus_XML,
      // plus_XSD: plus_XSD,
      in_YAML: in_YAML,
      in_JSOM: in_JSON,
      // in_XSD: in_XSD,
      aggregate_XML: aggregate_XML,
      // aggregate_XSD: aggregate_XSD,
      // XSLT: XSLT,
      out_YAML: out_YAML,
      out_JSON: out_JSON,
      out_XML: out_XML,
      // out_XSD: out_XSD,
      logSteps,
    }
  } catch (error) {
    logSteps.push(`Error occurred: ${error.message}`)
    throw error
  }
}


async function handleCasePlusYAMLAggregateXSLTInXML(
  plus_YAML,
  plus_XSD,
  aggregate_XSLT,
  map_XSLT,
  in_XML,
  in_XSD,
  logSteps
) {
  let plus_JSON, plus_XML, plus_XSD, in_YAML, in_JSON, in_XSD
  let aggregate_XML, aggregate_XSD, out_YAML, out_JSON, out_XML, out_XSD
  const verbose = true // Verbose is set to true

  try {
    logSteps.push("Starting validation and processing for case.")

    // Step 1: Validate plus_YAML
    const isValidPlusYAML = await validateYAML(plus_YAML, logSteps, verbose)
    logSteps.push(
      isValidPlusYAML
        ? "plus_YAML validation succeeded."
        : "plus_YAML validation failed."
    )

    // Step 2: Validate in_JSON
    // const isValidInJSON = await validateJSON(in_JSON, logSteps, verbose)
    // logSteps.push(
    //   isValidInJSON
    //     ? "in_JSON validation succeeded."
    //     : "in_JSON validation failed."
    // )

    // Step 3: Generate plus_JSON and Validate
    plus_JSON = YAMLtoJSON(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_JSON.")
    const isValidPlusJSON = await validateJSON(plus_JSON, logSteps, verbose)
    logSteps.push(
      isValidPlusJSON
        ? "plus_JSON validation succeeded."
        : "plus_JSON validation failed."
    )

    // Step 4: Convert plus_YAML to XML
    plus_XML = YAMLtoXML(plus_YAML)
    logSteps.push("Converted plus_YAML to plus_XML.")

    // Step 5: Convert in_JSON to YAML and XML
    in_YAML = XMLtoYAML(in_XML)
    logSteps.push("Converted in_JSON to in_YAML.")
    // in_XML = JSONtoXML(in_JSON)
    // logSteps.push("Converted in_JSON to in_XML.")
    combinedXML = combineXMLStrings(in_XML, plus_XML, "aggregate")
    logSteps.push("Successfully combined transformed XMLs into aggregate_XML.")

    // Step 6: Combine XMLs using aggregate_XSLT
    aggregate_XML = await transformXMLUsingXSLT(combinedXML, aggregate_XSLT)
    logSteps.push(
      "Transformed XML using aggregate_XSLT to produce aggregate_XML."
    )

    // Step 7: Compliance Checks for XMLs
    const isPlusXMLCompliant = await validateXML(plus_XML, logSteps)
    logSteps.push(
      isPlusXMLCompliant
        ? "plus_XML is valid and compliant."
        : "plus_XML is not valid or compliant."
    )

    const isInXMLCompliant = await validateXML(in_XML, logSteps)
    logSteps.push(
      isInXMLCompliant
        ? "in_XML is valid and compliant."
        : "in_XML is not valid or compliant."
    )

    const isCompliantWithInputXSD = await validateXSD(in_XML, in_XSD, logSteps)
    logSteps.push(
      isCompliantWithInputXSD
        ? "XML is compliant with input XSD"
        : "XML is not compliant with input XSD"
    )

    const isCompliantWithPlusXSD = await validateXSD(
      plus_XML,
      plus_XSD,
      logSteps
    )
    logSteps.push(
      isCompliantWithPlusXSD
        ? "plus_XML is compliant with plus_XSD"
        : "plus_XML is not compliant with plus_XSD"
    )

    const isAggregateXMLCompliant = await validateXML(aggregate_XML, logSteps)
    logSteps.push(
      isAggregateXMLCompliant
        ? "aggregate_XML is valid and compliant."
        : "aggregate_XML is not valid or compliant."
    )

    // Step 8: Generate Outputs
    out_XML = aggregate_XML
    logSteps.push("Set aggregate_XML as out_XML.")

    // Convert aggregate_XML to aggregate_XSD (Commented out as requested)
    /*
    aggregate_XSD = generateXSD(aggregate_XML, logSteps);
    logSteps.push("Generated aggregate_XSD from aggregate_XML.");
    */

    // Convert in_XML to in_XSD (Commented out as requested)
    /*
    in_XSD = generateXSD(in_XML, logSteps);
    logSteps.push("Generated in_XSD from in_XML.");
    */

    // Convert plus_XML to plus_XSD (Commented out as requested)
    /*
    plus_XSD = generateXSD(plus_XML, logSteps);
    logSteps.push("Generated plus_XSD from plus_XML.");
    */

    // Convert out_XML to YAML and JSON
    out_YAML = await XMLtoYAML(out_XML)
    logSteps.push("Converted out_XML to out_YAML.")
    out_JSON = await XMLtoJSON(out_XML)
    logSteps.push("Converted out_XML to out_JSON.")
    in_JSON = YAMLtoJSON(in_YAML)
    logSteps.push("Converted in_YAML to in_JSON")

    // Step 9: Logging Verbose Outputs

    logSteps.push("Processing for case completed successfully.")
    return {
      plus_JSON: plus_JSON,
      plus_XML: plus_XML,
      // plus_XSD: plus_XSD,
      in_YAML: in_YAML,
      in_JSOM: in_JSON,
      // in_XSD: in_XSD,
      aggregate_XML: aggregate_XML,
      // aggregate_XSD: aggregate_XSD,
      // XSLT: XSLT,
      out_YAML: out_YAML,
      out_JSON: out_JSON,
      out_XML: out_XML,
      // out_XSD: out_XSD,
      logSteps,
    }
  } catch (error) {
    logSteps.push(`Error occurred: ${error.message}`)
    throw error
  }
}




// let body = {
//   input1:
//     "https://airtable.com/appW7fUkTEqqte9Jc/tblKrfebiQ84S7gDr/viwa6xdcNYZfpr0uU/rec0kTxcE1dc8AmBI/fldqKo5KjCX98Ew0R?copyLinkToCellOrRecordOrigin=gridView",
//   input2:
//     "https://airtable.com/appW7fUkTEqqte9Jc/tblKrfebiQ84S7gDr/viwa6xdcNYZfpr0uU/rec0kTxcE1dc8AmBI/fldqKo5KjCX98Ew0R?copyLinkToCellOrRecordOrigin=gridView",
//   outputFormat: "json",
//   xslt: "https://airtable.com/appW7fUkTEqqte9Jc/tblKrfebiQ84S7gDr/viwa6xdcNYZfpr0uU/reci9tObSnR38Myne/fldqKo5KjCX98Ew0R?copyLinkToCellOrRecordOrigin=gridView",
//   input_format: "in_JSON",
// }

let body = {
  in_YAML:
    "https://airtable.com/appW7fUkTEqqte9Jc/tblKrfebiQ84S7gDr/viwa6xdcNYZfpr0uU/recr1RGoaSKRxUbd0/fldqKo5KjCX98Ew0R?copyLinkToCellOrRecordOrigin=gridView",
  in_JSON:
    "https://airtable.com/appW7fUkTEqqte9Jc/tblKrfebiQ84S7gDr/viwa6xdcNYZfpr0uU/rec786n3UYEyRNhiu/fldqKo5KjCX98Ew0R?copyLinkToCellOrRecordOrigin=gridView",
  in_XML:
    "https://airtable.com/appW7fUkTEqqte9Jc/tblKrfebiQ84S7gDr/viwa6xdcNYZfpr0uU/rec4u5NWYb3S69Ilh/fldqKo5KjCX98Ew0R?copyLinkToCellOrRecordOrigin=gridView",
  in_XSD:
    "https://airtable.com/appW7fUkTEqqte9Jc/tblKrfebiQ84S7gDr/viwa6xdcNYZfpr0uU/recgdWklBCmuVmxIE/fldqKo5KjCX98Ew0R?copyLinkToCellOrRecordOrigin=gridView",
  in_XSLT:
    "https://airtable.com/appW7fUkTEqqte9Jc/tblKrfebiQ84S7gDr/viwa6xdcNYZfpr0uU/recE38NCv8jviIMn6/fldqKo5KjCX98Ew0R?copyLinkToCellOrRecordOrigin=gridView",
  out_XSD:
    "https://airtable.com/appW7fUkTEqqte9Jc/tblKrfebiQ84S7gDr/viwa6xdcNYZfpr0uU/reczwx2Pc6MQqHJcL/fldqKo5KjCX98Ew0R?copyLinkToCellOrRecordOrigin=gridView",
    plus_YAML:
    "https://airtable.com/appW7fUkTEqqte9Jc/tblKrfebiQ84S7gDr/viwa6xdcNYZfpr0uU/recr1RGoaSKRxUbd0/fldqKo5KjCX98Ew0R?copyLinkToCellOrRecordOrigin=gridView",
  verbose: false
}
exports
  .handler(body)
  .then((response) => {
    console.log("Test Result:", JSON.parse(response.body));
  });

  function cleanJsonString(input) {
    // Remove escape slashes from the string
    return input.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
