const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");

// Define Lambda role and policies
const lambdaRole = new aws.iam.Role("lambdaRole", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Principal: {
          Service: "lambda.amazonaws.com",
        },
        Effect: "Allow",
        Sid: "",
      },
    ],
  }),
});

// Attach policy to Lambda role
new aws.iam.RolePolicyAttachment("lambdaExecutionPolicy", {
  role: lambdaRole.name,
  policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole,
});

// Define Lambda function
const lambdaFunction = new aws.lambda.Function("mapperFunction", {
  runtime: "nodejs18.x", // Ensure the correct version
  role: lambdaRole.arn,
  handler: "mapper.handler", // Ensure the handler is correct in your Lambda code
  code: new pulumi.asset.FileArchive("./lambdaMapper.zip"),
  environment: {
    variables: {
      NODE_OPTIONS: "--enable-source-maps",
    },
  },
  timeout: 30,
  memorySize: 1024
});

// Define API Gateway
const apiGateway = new aws.apigateway.RestApi("myApi", {
  description: "API Gateway for Lambda function",
});

// Set up resource for API Gateway
const resource = new aws.apigateway.Resource("resource", {
  restApi: apiGateway.id,
  parentId: apiGateway.rootResourceId,
  pathPart: "process",
});

// Create the POST method for the resource
const method = new aws.apigateway.Method("method", {
  restApi: apiGateway.id,
  resourceId: resource.id,
  httpMethod: "POST",
  authorization: "NONE",
});

// Integrate Lambda with API Gateway
const lambdaIntegration = new aws.apigateway.Integration("lambdaIntegration", {
  restApi: apiGateway.id,
  resourceId: resource.id,
  httpMethod: method.httpMethod,
  type: "AWS_PROXY",
  integrationHttpMethod: "POST",
  uri: lambdaFunction.invokeArn,
});

// Grant API Gateway permission to invoke Lambda
const lambdaPermission = new aws.lambda.Permission("apiGatewayInvokeLambda", {
  action: "lambda:InvokeFunction",
  function: lambdaFunction,
  principal: "apigateway.amazonaws.com",
  sourceArn: pulumi.interpolate`${apiGateway.executionArn}/*/*`,
});
// Add OPTIONS method for handling CORS preflight requests
const optionsMethod = new aws.apigateway.Method("optionsMethod", {
  restApi: apiGateway.id,
  resourceId: resource.id,
  httpMethod: "OPTIONS",
  authorization: "NONE",
});

// Define Method Response for CORS
const methodResponse = new aws.apigateway.MethodResponse("methodResponse", {
  restApi: apiGateway.id,
  resourceId: resource.id,
  httpMethod: method.httpMethod,
  statusCode: "200",
  responseModels: {
    "application/json": "Empty",
  },
  responseParameters: {
    "method.response.header.Access-Control-Allow-Origin": true,
    "method.response.header.Access-Control-Allow-Methods": true,
    "method.response.header.Access-Control-Allow-Headers": true,
  },
});

// Define Integration Response for CORS
const integrationResponse = new aws.apigateway.IntegrationResponse("integrationResponse", {
  restApi: apiGateway.id,
  resourceId: resource.id,
  httpMethod: method.httpMethod,
  statusCode: "200",
  responseParameters: {
    "method.response.header.Access-Control-Allow-Origin": "'*'",
    "method.response.header.Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
    "method.response.header.Access-Control-Allow-Headers": "'Content-Type,Authorization'",
  },
});


const optionsIntegration = new aws.apigateway.Integration("optionsIntegration", {
  restApi: apiGateway.id,
  resourceId: resource.id,
  httpMethod: optionsMethod.httpMethod,
  type: "MOCK",
  requestTemplates: {
    "application/json": `{"statusCode": 200}`,
  },
  integrationResponses: [
    {
      statusCode: "200",
      responseParameters: {
        "method.response.header.Access-Control-Allow-Origin": "'*'",
        "method.response.header.Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
        "method.response.header.Access-Control-Allow-Headers": "'Content-Type,Authorization'",
      },
      responseTemplates: {
        "application/json": "",
      },
    },
  ],
});

const optionsMethodResponse = new aws.apigateway.MethodResponse("optionsMethodResponse", {
  restApi: apiGateway.id,
  resourceId: resource.id,
  httpMethod: optionsMethod.httpMethod,
  statusCode: "200",
  responseParameters: {
    "method.response.header.Access-Control-Allow-Origin": true,
    "method.response.header.Access-Control-Allow-Methods": true,
    "method.response.header.Access-Control-Allow-Headers": true,
  },
});

// Now deploy the API
const deployment = new aws.apigateway.Deployment("deployment", {
  restApi: apiGateway.id,
  stageName: "prod",
  dependsOn: [
    method,
    lambdaIntegration,
    lambdaPermission,
    methodResponse,
    integrationResponse,
    optionsMethod,
    optionsIntegration,
    optionsMethodResponse,
  ], // Ensure the method is created before deployment
});

// Export the API endpoint
exports.url = pulumi.interpolate`${deployment.invokeUrl}/process`;
