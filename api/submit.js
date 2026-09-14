export default async function handler(req, res) {
  // --------------------------------------------------
  // CORS
  // --------------------------------------------------

  res.setHeader(
    'Access-Control-Allow-Origin',
    'https://ysoni2-art.github.io'
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  // Handle browser CORS preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    // --------------------------------------------------
    // GET DATA FROM WEBSITE
    // --------------------------------------------------

    const {
  participantId,
  modelSource,
  shape,
  objFile,
  customObjRepoPath,
  totalClicks,
  totalHits,
  faceHits,
  clicks,
  submittedAt,
  objText
} = req.body || {};

console.log(
  'OBJ DEBUG:',
  modelSource,
  objFile,
  objText ? objText.length : 0
); 

    // --------------------------------------------------
    // BASIC VALIDATION
    // --------------------------------------------------

    if (!participantId) {
      return res.status(400).json({
        error: 'Missing participantId'
      });
    }

    if (!modelSource) {
      return res.status(400).json({
        error: 'Missing modelSource'
      });
    }

    // --------------------------------------------------
    // GITHUB ENVIRONMENT VARIABLES
    // --------------------------------------------------

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || 'main';

    if (!token || !owner || !repo) {
      console.error(
        'Missing GitHub environment variables.'
      );

      return res.status(500).json({
        error:
          'GitHub server configuration is incomplete.'
      });
    }

    // --------------------------------------------------
    // SAFE FILENAMES
    // --------------------------------------------------

    function safeName(value) {
      return String(value || 'anonymous')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .substring(0, 80);
    }

    const safeParticipant =
      safeName(participantId);

    const timestamp =
      new Date()
        .toISOString()
        .replace(/[:.]/g, '-');

    // --------------------------------------------------
    // CHOOSE RESPONSE FOLDER
    // --------------------------------------------------

    let responseFolder;

    if (modelSource === 'uploaded') {
      responseFolder = 'custom/responses';
    } else {
      const safeShape =
        safeName(shape || 'unknown');

      responseFolder =
        `submissions/${safeShape}`;
    }

    // --------------------------------------------------
    // JSON RESPONSE FILE NAME
    // --------------------------------------------------

    const jsonFilename =
      `response_${safeParticipant}_${timestamp}.json`;

    const jsonPath =
      `${responseFolder}/${jsonFilename}`;

    // --------------------------------------------------
    // DATA TO SAVE
    // --------------------------------------------------

    const responseData = {
      participantId: participantId,

      modelSource: modelSource,

      shape: shape || null,

      objFile: objFile || null,

      customObjRepoPath:
        customObjRepoPath || null,

      totalClicks:
        totalClicks || 0,

      totalHits:
        totalHits || 0,

      faceHits:
        faceHits || {},

      clicks:
        clicks || [],

      submittedAt:
        submittedAt ||
        new Date().toISOString()
    };

    // --------------------------------------------------
    // CONVERT JSON TO BASE64
    // --------------------------------------------------

    const jsonContent =
      Buffer.from(
        JSON.stringify(
          responseData,
          null,
          2
        ),
        'utf8'
      ).toString('base64');

    // --------------------------------------------------
    // FUNCTION TO UPLOAD FILE TO GITHUB
    // --------------------------------------------------

    async function uploadToGitHub(
      path,
      base64Content,
      message
    ) {
      const url =
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

      const response =
        await fetch(url, {
          method: 'PUT',

          headers: {
            'Accept':
              'application/vnd.github+json',

            'Authorization':
              `Bearer ${token}`,

            'X-GitHub-Api-Version':
              '2026-03-10',

            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            message: message,

            content:
              base64Content,

            branch: branch
          })
        });

      const result =
        await response.json();

      if (!response.ok) {
        console.error(
          'GitHub API error:',
          result
        );

        throw new Error(
          result.message ||
          `GitHub API returned HTTP ${response.status}`
        );
      }

      return result;
    }

    // --------------------------------------------------
    // SAVE JSON RESPONSE
    // --------------------------------------------------

    const jsonResult =
      await uploadToGitHub(
        jsonPath,

        jsonContent,

        `Add saliency response: ${jsonFilename}`
      );

    // --------------------------------------------------
    // SAVE CUSTOM OBJ MODEL IF UPLOADED
    // --------------------------------------------------

    let objPath = null;
    let objResult = null;

    if (
      modelSource === 'uploaded' &&
      objText &&
      objFile
    ) {
      const safeObjFilename =
        safeName(objFile);

      objPath =
        `custom/models/${Date.now()}_${safeObjFilename}`;

      const objContent =
        Buffer.from(
          objText,
          'utf8'
        ).toString('base64');

      objResult =
        await uploadToGitHub(
          objPath,

          objContent,

          `Add custom OBJ model: ${safeObjFilename}`
        );
    }

    // --------------------------------------------------
    // SUCCESS
    // --------------------------------------------------

    return res.status(200).json({
      success: true,

      message:
        'Response saved successfully.',

      jsonPath: jsonPath,

      objPath: objPath,

      jsonUrl:
        jsonResult.content?.html_url ||
        null,

      objUrl:
        objResult?.content?.html_url ||
        null
    });

  } catch (error) {
    // --------------------------------------------------
    // ERROR
    // --------------------------------------------------

    console.error(
      'Submission error:',
      error
    );

    return res.status(500).json({
      success: false,

      error:
        error.message ||
        'Unknown server error'
    });
  }
}
