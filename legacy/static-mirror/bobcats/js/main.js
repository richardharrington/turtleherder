function getCookieValue (cookieName) {
  var cookieValue = document.cookie;
  var cookieStartsAt = cookieValue.indexOf(" " + cookieName + "=");
  if (cookieStartsAt == -1) {
    cookieStartsAt = cookieValue.indexOf(cookieName + "=");
  }
  if (cookieStartsAt == -1) {
    cookieValue = null;
  }
  else {
    cookieStartsAt = cookieValue.indexOf("=", cookieStartsAt) + 1;
    var cookieEndsAt = cookieValue.indexOf(";", cookieStartsAt);
    if (cookieEndsAt == -1) {
      cookieEndsAt = cookieValue.length;
    }
    cookieValue = unescape(cookieValue.substring(cookieStartsAt, cookieEndsAt));
  }
  return cookieValue;
}

function togglePastGames(cookieName) {
    var expireDate = new Date();
    expireDate.setMonth(expireDate.getMonth() + 6);
    if (document.getElementById ("togglePastGamesID").innerHTML == "Show past games") {
        document.getElementById ("togglePastGamesID").innerHTML = "Hide past games";
        document.getElementById ("pastGames").className = "showing";
        document.cookie = cookieName + "=showing;expires=" + expireDate.toGMTString() + ";";
    }
    else {
        document.getElementById ("togglePastGamesID").innerHTML = "Show past games";
        document.getElementById ("pastGames").className = "hiding";
        document.cookie = cookieName + "=hiding;expires=" + expireDate.toGMTString() + ";";
    }
}

function setPastGamesDisplayPref (cookieName) {
  var cookieValue = getCookieValue (cookieName);
  if (cookieValue != null) {
    if (cookieValue == "hiding") {
      document.getElementById ("togglePastGamesID").innerHTML = "Show past games";
      document.getElementById ("pastGames").className = "hiding";
    }
    else {
      document.getElementById ("togglePastGamesID").innerHTML = "Hide past games";
      document.getElementById ("pastGames").className = "showing";
    }
  }
}





function validateGame(myForm) {
  // clear errors from before
  document.getElementById("nameError").className = "hiding";
  document.getElementById("dateError").className = "hiding";
  document.getElementById("timeError").className = "hiding"
  var noErrors = true;
  // name
  if (myForm.name.value == "") {
    noErrors = false;
    document.getElementById("nameError").className = "showing";
  }

  // date
  if ( !formItemSelected (myForm.month) || !formItemSelected (myForm.day) || !formItemSelected (myForm.year) ) {
    noErrors = false;
    document.getElementById("dateError").className = "showing";
  }

  // time
  if ( !formItemSelected (myForm.hour) || !formItemSelected (myForm.minute) || !formItemSelected (myForm.ampm) ) {
    noErrors = false;
    document.getElementById("timeError").className = "showing";
  }
  return noErrors;
}



function validatePlayer() {
  var myForm = document.form1;
  // clear errors from before
  document.getElementById("nameError").className = "hiding";
  document.getElementById("genderError").className = "hiding";
  var noErrors = true;
  // name
  if (myForm.name.value == "") {
    noErrors = false;
    document.getElementById("nameError").className = "showing";
  }

  // gender
  if ( !myForm.gender[0].checked && !myForm.gender[1].checked ) {
    noErrors = false;
    document.getElementById("genderError").className = "showing";
  }

  return noErrors;
}



function formItemSelected (formSelectObject, test) {
  // first the special case of the "blank" option we're sometimes using
  if (formSelectObject.options[0].value == "blank" && formSelectObject.options[0].selected)
    return false;


  var itemSelected = false;
  for (var i=0; i < formSelectObject.length; i++) {
    itemSelected = itemSelected || formSelectObject.options[i].selected;

  }
  return itemSelected;
}

