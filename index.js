'use strict';

var AWS = require('aws-sdk');
var dynamo = new AWS.DynamoDB({
  region: process.env['REGION']
});

const https = require('https');

var ChannelAccessToken = process.env['CHANNELACCESSTOKEN'];
var A3rtApiKey = process.env['A3RTAPIKEY'];


var getParams = {
  "TableName": " ",
  "Key": {
    "id":{"S":" "}
  }
};

var scanParams = {
  "TableName": " ",
};



exports.handler = (event, context, callback) => {

  console.log('EVENT: ', event);

  var event_data = JSON.parse(event.body);
  console.log('EVENT_Data: ', JSON.stringify(event_data));

  const messageData = event_data.events && event_data.events[0];
  var id = messageData.source.userId;

   //グループからのメッセージ
  if(messageData.source.groupId != null && messageData.source.groupId.length > 0){
    id = messageData.source.groupId;
  }


  // DynamoDB上を検索し，ユーザ情報を取得
  getParams.Key.id = {"S": id};
  getParams.TableName = "UserTable";
  dynamo.getItem(getParams,function(error,dynamoGetData){
    if(error){
      console.log("dynamoDB getItem Error: " + error);
      callback(null, 'Success!');
    }

    console.log("dynamoDB getItem: " + JSON.stringify(dynamoGetData));

    // 初回アクセスユーザの処理(Insert DisplayName in DynamoDB)
    if (Object.keys(dynamoGetData).length == 0){

      // ディスプレイネームを取得
      var options = {
        hostname: 'api.line.me',
        path: '/v2/bot/profile/' + id,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': 'Bearer ' + ChannelAccessToken
        },
        method: 'GET',
      };

      var req = https.request(options,  function(res){
        res.setEncoding('utf8');
        res.on('data',function(userInformation) {
          var userName = JSON.parse(userInformation).displayName;
          console.log("UserName: " + userName);

          var table = "UserTable";
          var item = {
            "id":  {"S":id},
            "Name":{"S":userName},
            "ActionFlag":{"S":"やまびこ"},
            "NickName":{"S":" "}
          };
          // ディスプレイネームの登録
          dynamoPutItem(table,item);
        });
      });

      req.on('error', function(e) {
        var message = "通知に失敗しました. LINEから次のエラーが返りました: " + e.message;
        console.error(message);
        context.fail(message);
      });
      req.end();

      var response =  "初メッセージありがとう！\nニックネーム教えてください！";
      var postData = JSON.stringify({
        "messages": [{
          "type": "text",
          "text": response
        }],
        "to": id
      });
      postToLineBot(postData);
      callback(null, 'Success!');
    }


    // アクセス2回目のユーザの処理(DynamoDBにニックネームを登録)
    else if(dynamoGetData.Item.NickName.S == " ") {

      if(messageData.message.type == "text"){
        var table = "UserTable";
        var key = {"id":{"S":id}};
        var updateExpression = "set NickName =:n" ;
        var expressionAttributeValues ={":n":{"S":messageData.message.text}};
        dynamoUpdateItem(table,key,updateExpression,expressionAttributeValues);

        var response = "こんにちは！" + messageData.message.text + "さん！";
      }

      // テキスト以外が返答されたら，ニックネーム入力を促す
      else{
        var response = "ニックネーム教えて欲しいな！";
      }

      var postData = JSON.stringify({
        "messages": [{
          "type": "text",
          "text": response
        }],
        "to": id
      });
      postToLineBot(postData);
      callback(null, 'Success!');
    }


    // アクセス3回以上のユーザの処理
    else{
      // 処理モード変更
      console.log("messageData.message.text: " + messageData.message.text);
      switch(messageData.message.text){

        case "やまびこモード" :
        var response = "やまびこモードに変更！\nこのモードでは発言をリピートするよ！";
        var postData = JSON.stringify({
          "messages": [{
            "type": "text",
            "text": response
          }],
          "to": id
        });
        postToLineBot(postData);

        // ActionFlagの更新
        var table = "UserTable";
        var key = {"id":{"S":id}};
        var updateExpression = "set ActionFlag =:a" ;
        var expressionAttributeValues ={":a":{"S":"やまびこ"}};
        dynamoUpdateItem(table,key,updateExpression,expressionAttributeValues);

        callback(null, 'Success!');
        break;


        case "やまびかないモード" :
        var response = "やまびかないモードに変更！\nこのモードでは発言をリピートしないよ！";
        var postData = JSON.stringify({
          "messages": [{
            "type": "text",
            "text": response
          }],
          "to": id
        });
        postToLineBot(postData);

        // ActionFlagの更新
        var table = "UserTable";
        var key = {"id":{"S":id}};
        var updateExpression = "set ActionFlag =:a" ;
        var expressionAttributeValues ={":a":{"S":"やまびかない"}};
        dynamoUpdateItem(table,key,updateExpression,expressionAttributeValues);

        callback(null, 'Success!');
        break;


        //  非永続モード
        case "ニックネーム変更" :
        var response = "ニックネームを変更します！\nニックネームを教えてください！";
        var postData = JSON.stringify({
          "messages": [{
            "type": "text",
            "text": response
          }],
          "to": id
        });
        postToLineBot(postData);

        // ニックネームの消去
        var table = "UserTable";
        var key = {"id":{"S":id}};
        var updateExpression = "set NickName =:n" ;
        var expressionAttributeValues = {":n":{"S":" "}};
        dynamoUpdateItem(table,key,updateExpression,expressionAttributeValues);

        callback(null, 'Success!');
        break;

        case "AI":
        var response = "AIモードに変更！\nA3rtが返答するよ！";
        var postData = JSON.stringify({
          "messages": [{
            "type": "text",
            "text": response
          }],
          "to": id
        });

        postToLineBot(postData);

        var table = "UserTable";
        var key = {"id":{"S":id}};
        var updateExpression = "set ActionFlag =:a";
        var expressionAttributeValues = {":a":{"S":"AI"}};
        dynamoUpdateItem(table,key,updateExpression,expressionAttributeValues);

        callback(null, 'Success!');
        break;

        case "こんにちは" :
        case "こんばんは" :
        var response = messageData.message.text + "！"+ dynamoGetData.Item.NickName.S + "さん！";
        var postData = JSON.stringify({
          "messages": [{
            "type": "text",
            "text": response
          }],
          "to": id
        });

        postToLineBot(postData);
        callback(null, 'Success!');
        break;


        case "ヘルプ" :
        var response = "以下の単語を送信すると，モードが切り替わります\n ・やまびこモード\n ・やまびかないモード\n ・ニックネーム変更\n・AI\n\n ・こんにちは";
        var postData = JSON.stringify({
          "messages": [{
            "type": "text",
            "text": response
          }],
          "to": id
        });
        postToLineBot(postData);
        callback(null, 'Success!');
        break;

        //////////////////// やまびこ or Not やまびこ　////////////////////
        default:

        // やまびこモード
        if (dynamoGetData.Item.ActionFlag.S == "やまびこ"){
          // テキスト返答
          if(messageData.message.type == "text"){
            var postData = JSON.stringify({
              "messages": [{
                "type": "text",
                "text": messageData.message.text
              }],
              "to": id
            });
            postToLineBot(postData);
          }
          // スタンプ返答(有料スタンプは返答不可？)
          else if(messageData.message.type == "sticker"){
            var postData = JSON.stringify({
              "messages": [{
                "type": "sticker",
                "stickerId": messageData.message.stickerId,
                "packageId": messageData.message.packageId
              }],
              "to": id
            });
            postToLineBot(postData);
          }
          // エラー
          else{
            console.log("Debug: MessageType is undefine");
          }
          callback(null, 'Success!');
        }

        // やまびかないモード
        else if (dynamoGetData.Item.ActionFlag.S == "やまびかない"){
          scanParams.TableName = "MentionTable";
          dynamo.scan(scanParams, function(error,dynamoScanData){
            if(error){
              console.log("dynamoDB scanItem Error: " + error);
              callback(null, 'Success!');
            }

            var random = Math.floor(Math.random() * Math.floor(dynamoScanData.Items.length));
            console.log("random :" + random);

            var postData = JSON.stringify({
              "messages": [{
                "type": "text",
                "text": dynamoScanData.Items[random].Mention.S
              }],
              "to": id
            });
            postToLineBot(postData);
            callback(null, 'Success!');
          });
        }

        // A3rt連携モード
        else if(dynamoGetData.Item.ActionFlag.S == "AI"){
          var response = postToA3rt(messageData.message.text,id);
          callback(null, 'Success!');
        }

        else{
          console.log('Error: ActionFlag is undefine')
          callback(null, 'Success!');
        }
        break;
      }
    }
  });
};



/////////////////// Function ///////////////////

var dynamoPutItem = function(table,item){
  var putParams = {
    "TableName": table,
    "Item": item
  };
  dynamo.putItem(putParams, function(error,dynamoPutData){
    console.log("dynamoDB putItem Error: " + error);
    context.done(null,dynamoPutData);
  });

}

var dynamoUpdateItem = function(table,key,updateExpression,expressionAttributeValues){
  var updateParams = {
    "TableName": table,
    "Key": key,
    "UpdateExpression": updateExpression,
    "ExpressionAttributeValues":expressionAttributeValues
  };
  dynamo.updateItem(updateParams, function(error,dynamoUpdateData){
    console.log("dynamoDB updateItem Error: " + error);
  });

}

var postToLineBot = function(postData){
  var options = {
    hostname: 'api.line.me',
    path: '/v2/bot/message/push',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(postData),
      'Authorization': 'Bearer ' + ChannelAccessToken
    },
    method: 'POST',
  };
  console.log("MessagePush RequestHeader: " + JSON.stringify(options));


  // APIリクエスト
  var req = https.request(options,  function(res){
    res.setEncoding('utf8');
  });

  console.log("PostData: " + postData);
  req.write(postData);

  req.on('data', function (body) {
    console.log("RequestBody: " + body);
  });

  req.on('error', function(e) {
    var message = "通知に失敗しました. LINEから次のエラーが返りました: " + e.message;
    console.error(message);
    context.fail(message);
  });

  req.end();

}

var postToA3rt = function(postQuery, id){

  const request = require('request');
  const smallTalkRequestUrl = 'https://api.a3rt.recruit-tech.co.jp/talk/v1/smalltalk';
  const smallTalkRequestOption = {
    url: smallTalkRequestUrl,
    form: {
      apikey: A3rtApiKey,
      query: postQuery
    }
  };

  request.post(smallTalkRequestOption, function(error, response, body){
    if(!error && response.statusCode == 200){
    console.log("Request Success.");
    var response = JSON.parse(body).results[0].reply;
    console.log("Request is: " + JSON.stringify(response));
  }
  else{
    console.log("Request Error: " + error)
    var response = JSON.parse(body).results[0].reply;
    console.log("Request is: " + JSON.stringify(response));
  }

  var postData = JSON.stringify({
      "messages": [{
        "type": "text",
        "text": response
      }],
      "to": id
    });
    postToLineBot(postData);
  });
}
